import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/auth/account";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import { logAdminActivity, requirePlatformAdmin } from "@/lib/platform/admin";
import {
  accountAccess,
  clientBucket,
  computeEndDate,
  isDuration,
  isPlanId,
  normalizeDomain,
  normalizeHex,
} from "@/lib/platform/plans";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ACCOUNT_COLS =
  "id, name, status, plan, plan_ends_at, business_phone, white_label, brand_name, brand_logo_url, brand_primary, brand_accent, brand_domain, created_at";

/** GET /api/admin/clients/[id] — one client with members, note, activity. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db, userId } = await requirePlatformAdmin();
    const { id } = await params;
    if (!UUID_RE.test(id)) return notFound();

    const [accRes, membersRes, noteRes, waRes, actRes, mineRes] = await Promise.all([
      db.from("accounts").select(ACCOUNT_COLS).eq("id", id).maybeSingle(),
      db
        .from("profiles")
        .select("user_id, full_name, email, account_role")
        .eq("account_id", id),
      db.from("platform_client_notes").select("note").eq("account_id", id).maybeSingle(),
      db.from("whatsapp_config").select("status").eq("account_id", id).maybeSingle(),
      db
        .from("platform_admin_activity")
        .select("id, action, details, created_at")
        .eq("account_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
      db.from("profiles").select("account_id").eq("user_id", userId).maybeSingle(),
    ]);
    if (accRes.error) throw accRes.error;
    if (!accRes.data) return notFound();
    const a = accRes.data;

    return NextResponse.json({
      client: {
        id: a.id,
        name: a.name,
        status: a.status,
        plan: a.plan,
        planEndsAt: a.plan_ends_at,
        businessPhone: a.business_phone,
        createdAt: a.created_at,
        bucket: clientBucket({ status: a.status, plan_ends_at: a.plan_ends_at }),
        isMine: mineRes.data?.account_id === a.id,
        whatsappConnected: waRes.data?.status === "connected",
        note: noteRes.data?.note ?? "",
        branding: {
          whiteLabel: Boolean(a.white_label),
          brandName: a.brand_name,
          logoUrl: a.brand_logo_url,
          primary: a.brand_primary,
          accent: a.brand_accent,
          domain: a.brand_domain,
        },
      },
      members: (membersRes.data ?? []).map((m) => ({
        userId: m.user_id,
        name: m.full_name,
        email: m.email,
        role: m.account_role,
      })),
      activity: (actRes.data ?? []).map((r) => ({
        id: r.id,
        action: r.action,
        details: r.details ?? {},
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * PATCH /api/admin/clients/[id]
 * Body: { action: "renew", duration, plan? }
 *     | { action: "pause" } | { action: "reactivate" }
 *     | { action: "update", name?, plan?, businessPhone?, note? }
 *     | { action: "branding", whiteLabel, brandName?, primary?, accent?, domain? }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db, userId } = await requirePlatformAdmin();
    const limit = checkRateLimit(`admin-client:${userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const { id } = await params;
    if (!UUID_RE.test(id)) return notFound();
    const body = await request.json().catch(() => null);
    const action = body?.action;

    const { data: acc, error: accErr } = await db
      .from("accounts")
      .select("id, status, plan, plan_ends_at")
      .eq("id", id)
      .maybeSingle();
    if (accErr) throw accErr;
    if (!acc) return notFound();

    const { data: mine } = await db
      .from("profiles")
      .select("account_id")
      .eq("user_id", userId)
      .maybeSingle();
    const isMine = mine?.account_id === id;

    const log = (name: string, details: Record<string, unknown> = {}) =>
      logAdminActivity(db, { actorUserId: userId, accountId: id, action: name, details });

    if (action === "renew") {
      if (!isDuration(body?.duration)) return bad("Choose a duration.");
      const plan = body?.plan === undefined ? acc.plan : body.plan;
      if (plan !== null && !isPlanId(plan)) return bad("Unknown plan.");
      const current = acc.plan_ends_at ? new Date(acc.plan_ends_at) : null;
      const endsAt = computeEndDate(body.duration, current);
      const { error } = await db
        .from("accounts")
        .update({
          plan,
          plan_ends_at: endsAt.toISOString(),
          status: body.duration === "trial14" ? "trial" : "active",
          renewal_reminded_at: null,
        })
        .eq("id", id);
      if (error) throw error;
      await log("plan_renewed", { duration: body.duration, plan, endsAt: endsAt.toISOString() });
      return NextResponse.json({ ok: true, planEndsAt: endsAt.toISOString() });
    }

    if (action === "pause") {
      if (isMine) return bad("You can't pause your own account.");
      const { error } = await db.from("accounts").update({ status: "paused" }).eq("id", id);
      if (error) throw error;
      await log("client_paused");
      return NextResponse.json({ ok: true });
    }

    if (action === "reactivate") {
      if (accountAccess({ status: "active", plan_ends_at: acc.plan_ends_at }) === "expired") {
        return bad("The plan has ended. Renew it instead, which also reactivates the account.");
      }
      const { error } = await db.from("accounts").update({ status: "active" }).eq("id", id);
      if (error) throw error;
      await log("client_reactivated");
      return NextResponse.json({ ok: true });
    }

    if (action === "update") {
      const patch: Record<string, unknown> = {};
      if (typeof body?.name === "string") {
        const name = body.name.trim().slice(0, 120);
        if (!name) return bad("Business name can't be empty.");
        patch.name = name;
      }
      if (body?.plan !== undefined) {
        if (!isPlanId(body.plan)) return bad("Unknown plan.");
        patch.plan = body.plan;
      }
      if (body?.businessPhone !== undefined) {
        patch.business_phone =
          typeof body.businessPhone === "string" && body.businessPhone.trim()
            ? body.businessPhone.trim().slice(0, 30)
            : null;
      }
      if (Object.keys(patch).length > 0) {
        const { error } = await db.from("accounts").update(patch).eq("id", id);
        if (error) throw error;
      }
      if (typeof body?.note === "string") {
        const { error } = await db.from("platform_client_notes").upsert({
          account_id: id,
          note: body.note.slice(0, 2000),
          updated_at: new Date().toISOString(),
        });
        if (error) throw error;
      }
      await log("client_updated", { fields: [...Object.keys(patch), ...(typeof body?.note === "string" ? ["note"] : [])] });
      return NextResponse.json({ ok: true });
    }

    if (action === "branding") {
      const whiteLabel = Boolean(body?.whiteLabel);
      const primary = body?.primary ? normalizeHex(body.primary) : null;
      const accent = body?.accent ? normalizeHex(body.accent) : null;
      if (body?.primary && !primary) return bad("Main colour must look like #3E6FD6.");
      if (body?.accent && !accent) return bad("Accent colour must look like #E0A93A.");
      const domain = body?.domain ? normalizeDomain(body.domain) : null;
      if (body?.domain && !domain) return bad("Enter a web address like crm.theirbusiness.com.");
      const brandName =
        typeof body?.brandName === "string" && body.brandName.trim()
          ? body.brandName.trim().slice(0, 60)
          : null;
      const { error } = await db
        .from("accounts")
        .update({
          white_label: whiteLabel,
          brand_name: brandName,
          brand_primary: primary,
          brand_accent: accent,
          brand_domain: domain,
        })
        .eq("id", id);
      if (error) {
        if (error.code === "23505") return bad("Another client already uses that web address.");
        throw error;
      }
      await log("branding_updated", { whiteLabel, domain });
      return NextResponse.json({ ok: true });
    }

    return bad("Unknown action.");
  } catch (err) {
    return toErrorResponse(err);
  }
}

function bad(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}
function notFound() {
  return NextResponse.json({ error: "Client not found." }, { status: 404 });
}
