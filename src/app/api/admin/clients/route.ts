import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/auth/account";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import {
  appBaseUrl,
  generateTempPassword,
  logAdminActivity,
  requirePlatformAdmin,
  signInLink,
} from "@/lib/platform/admin";
import { computeEndDate, isDuration, isPlanId } from "@/lib/platform/plans";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/**
 * POST /api/admin/clients — create a client business + its owner login.
 *
 * Body: { businessName, businessPhone?, ownerName, ownerEmail,
 *         access: "invite" | "password", plan, duration, note? }
 *
 * The auth user is created through the admin API; the existing
 * `handle_new_user` trigger bootstraps the account + owner profile,
 * which we then rename and put on the chosen plan. Nothing is emailed:
 * the response carries either a sign-in link or a temporary password
 * for the operator to send on WhatsApp.
 */
export async function POST(request: Request) {
  try {
    const { db, userId } = await requirePlatformAdmin();
    const limit = checkRateLimit(`admin-create:${userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = await request.json().catch(() => null);
    const businessName = str(body?.businessName, 120);
    const businessPhone = str(body?.businessPhone, 30) || null;
    const ownerName = str(body?.ownerName, 120);
    const ownerEmail = str(body?.ownerEmail, 254).toLowerCase();
    const access = body?.access === "password" ? "password" : "invite";
    const note = str(body?.note, 2000);
    const plan = body?.plan;
    const duration = body?.duration;

    if (!businessName) return bad("Business name is required.");
    if (!ownerName) return bad("Owner name is required.");
    if (!EMAIL_RE.test(ownerEmail)) return bad("Enter a valid owner email.");
    if (!isPlanId(plan)) return bad("Choose a plan.");
    if (!isDuration(duration)) return bad("Choose a duration.");

    let newUserId: string;
    let link: string | null = null;
    let tempPassword: string | null = null;

    if (access === "password") {
      tempPassword = generateTempPassword();
      const { data, error } = await db.auth.admin.createUser({
        email: ownerEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: ownerName, must_change_password: true },
      });
      if (error || !data.user) return authError(error?.message);
      newUserId = data.user.id;
    } else {
      const { data, error } = await db.auth.admin.generateLink({
        type: "invite",
        email: ownerEmail,
        options: { data: { full_name: ownerName } },
      });
      if (error || !data.user) return authError(error?.message);
      newUserId = data.user.id;
      link = signInLink(appBaseUrl(request), data.properties.hashed_token, "invite");
    }

    const { data: profile, error: profileErr } = await db
      .from("profiles")
      .select("account_id")
      .eq("user_id", newUserId)
      .maybeSingle();
    if (profileErr || !profile?.account_id) {
      console.error("[POST /api/admin/clients] bootstrap missing:", profileErr?.message);
      return NextResponse.json(
        { error: "The login was created but its account was not. Delete the user in Supabase and try again." },
        { status: 500 },
      );
    }
    const accountId = profile.account_id as string;
    const endsAt = computeEndDate(duration, null);

    const { error: updErr } = await db
      .from("accounts")
      .update({
        name: businessName,
        business_phone: businessPhone,
        plan,
        status: duration === "trial14" ? "trial" : "active",
        plan_ends_at: endsAt.toISOString(),
        renewal_reminded_at: null,
      })
      .eq("id", accountId);
    if (updErr) throw updErr;

    if (note) {
      await db
        .from("platform_client_notes")
        .upsert({ account_id: accountId, note, updated_at: new Date().toISOString() });
    }

    await logAdminActivity(db, {
      actorUserId: userId,
      accountId,
      action: "client_created",
      details: { plan, duration, access, ownerEmail },
    });

    return NextResponse.json({
      accountId,
      ownerEmail,
      link,
      tempPassword,
      planEndsAt: endsAt.toISOString(),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

function bad(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

function authError(message: string | undefined) {
  const m = message ?? "";
  if (/already (been )?registered|already exists/i.test(m)) {
    return NextResponse.json(
      { error: "A login with this email already exists." },
      { status: 409 },
    );
  }
  console.error("[POST /api/admin/clients] auth error:", m);
  return NextResponse.json({ error: m || "Could not create the login." }, { status: 400 });
}
