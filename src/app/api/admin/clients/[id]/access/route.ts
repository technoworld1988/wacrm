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

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/admin/clients/[id]/access — give the client's owner a way
 * back in. Body: { mode: "link" | "password" }.
 *   link     → a fresh one-time sign-in link to set a new password
 *   password → a new temporary password they must change at first login
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db, userId } = await requirePlatformAdmin();
    const limit = checkRateLimit(`admin-access:${userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Client not found." }, { status: 404 });
    }
    const body = await request.json().catch(() => null);
    const mode = body?.mode === "password" ? "password" : "link";

    const { data: owner, error } = await db
      .from("profiles")
      .select("user_id, email")
      .eq("account_id", id)
      .eq("account_role", "owner")
      .maybeSingle();
    if (error) throw error;
    if (!owner?.email) {
      return NextResponse.json({ error: "This client has no owner login." }, { status: 404 });
    }
    if (owner.user_id === userId) {
      return NextResponse.json({ error: "Use Settings to change your own password." }, { status: 400 });
    }

    if (mode === "password") {
      const tempPassword = generateTempPassword();
      const { error: updErr } = await db.auth.admin.updateUserById(owner.user_id, {
        password: tempPassword,
        user_metadata: { must_change_password: true },
      });
      if (updErr) throw updErr;
      await logAdminActivity(db, { actorUserId: userId, accountId: id, action: "temp_password_set" });
      return NextResponse.json({ email: owner.email, tempPassword });
    }

    const { data, error: linkErr } = await db.auth.admin.generateLink({
      type: "recovery",
      email: owner.email,
    });
    if (linkErr || !data?.properties?.hashed_token) throw linkErr ?? new Error("no link");
    await logAdminActivity(db, { actorUserId: userId, accountId: id, action: "signin_link_created" });
    return NextResponse.json({
      email: owner.email,
      link: signInLink(appBaseUrl(request), data.properties.hashed_token, "recovery"),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
