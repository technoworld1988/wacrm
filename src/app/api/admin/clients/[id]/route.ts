import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/auth/account";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import { logAdminActivity, requirePlatformAdmin } from "@/lib/platform/admin";
import {
  accountAccess,
  clientBucket,
  computeEndDate,
  isDuration,
  normalizeDomain,
  normalizeHex,
  planLimitColumns,
  priceFor,
  discountUsable,
} from "@/lib/platform/plans";
import { loadDiscount, loadPlan } from "@/lib/platform/catalog";
import { getAiAllowance } from "@/lib/platform/usage";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ACCOUNT_COLS =
  "id, name, status, plan, plan_ends_at, business_phone, white_label, brand_name, brand_logo_url, brand_primary, brand_accent, brand_domain, created_at, limit_users, limit_contacts, limit_ai_replies, ai_test_allowance, discount_id";

/** Non-negative integer, null (= unlimited), or undefined when invalid. */
function limitValue(v: unknown, min: number): number | null | undefined {
  if (v === null || v === "") return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isInteger(n) || n < min || n > 10_000_000) return undefined;
  return n;
}

/** GET /api/admin/clients/[id] — one client with members, note, activity. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db, userId } = await requirePlatformAdmin();
    const { id } = await params;
    if (!UUID_RE.test(id)) return notFound();

    const [accRes, membersRes, noteRes, waRes, actRes, mineRes, contactsRes, allowance] = await Promise.all([
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
      db.from("contacts").select("id", { count: "exact", head: true }).eq("account_id", id),
      getAiAllowance(db, id).catch(() => null),
    ]);
    if (accRes.error) throw accRes.error;
    if (!accRes.data) return notFound();
    const a = accRes.data;
    const [plan, discount] = await Promise.all([
      a.plan ? loadPlan(db, a.plan as string) : Promise.resolve(null),
      a.discount_id ? loadDiscount(db, a.discount_id as string) : Promise.resolve(null),
    ]);

    return NextResponse.json({
      client: {
        id: a.id,
        name: a.name,
        status: a.status,
        plan: a.plan,
        planName: plan?.name ?? null,
        planIsBonus: plan?.isBonus ?? false,
        discount,
        // Amount to collect per period, after this client's discount.
        pricing: plan
          ? {
              "1m": priceFor(plan, "1m", discount),
              "3m": priceFor(plan, "3m", discount),
              "12m": priceFor(plan, "12m", discount),
            }
          : null,
        planEndsAt: a.plan_ends_at,
        businessPhone: a.business_phone,
        createdAt: a.created_at,
        bucket: clientBucket({ status: a.status, plan_ends_at: a.plan_ends_at }),
        isMine: mineRes.data?.account_id === a.id,
        whatsappConnected: waRes.data?.status === "connected",
        note: noteRes.data?.note ?? "",
        usage: {
          users: { used: (membersRes.data ?? []).length, limit: a.limit_users },
          contacts: { used: contactsRes.count ?? 0, limit: a.limit_contacts },
          aiReplies: allowance?.replies ?? { used: 0, limit: a.limit_ai_replies },
          aiTests: allowance?.tests ?? { used: 0, limit: a.ai_test_allowance },
        },
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
      .select("id, status, plan, plan_ends_at, discount_id")
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
      if (plan !== null && !(await loadPlan(db, plan))) return bad("Unknown plan.");
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
        const newPlan = await loadPlan(db, body.plan);
        if (!newPlan) return bad("Unknown plan.");
        patch.plan = newPlan.key;
        // A plan change resets limits to that plan's defaults; adjust
        // them afterwards with the "limits" action if needed.
        if (newPlan.key !== acc.plan) Object.assign(patch, planLimitColumns(newPlan));
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

    if (action === "discount") {
      let discountId: string | null = null;
      if (body?.discountId) {
        const d = await loadDiscount(db, body.discountId);
        if (!d) return bad("Discount not found.");
        // Keeping an existing (now expired) discount is fine; giving a new
        // one requires it to still be on offer.
        if (d.id !== acc.discount_id && !discountUsable(d)) return bad("That discount has ended or was switched off.");
        discountId = d.id;
      }
      const { error } = await db.from("accounts").update({ discount_id: discountId }).eq("id", id);
      if (error) throw error;
      await log(discountId ? "discount_applied" : "discount_removed", { discountId });
      return NextResponse.json({ ok: true });
    }

    if (action === "limits") {
      const users = limitValue(body?.users, 1);
      const contacts = limitValue(body?.contacts, 0);
      const aiReplies = limitValue(body?.aiReplies, 0);
      const aiTests = limitValue(body?.aiTests, 0);
      if ([users, contacts, aiReplies, aiTests].some((v) => v === undefined)) {
        return bad("Limits must be whole numbers (leave empty for unlimited).");
      }
      const { error } = await db
        .from("accounts")
        .update({
          limit_users: users,
          limit_contacts: contacts,
          limit_ai_replies: aiReplies,
          ai_test_allowance: aiTests,
        })
        .eq("id", id);
      if (error) throw error;
      await log("limits_updated", { users, contacts, aiReplies, aiTests });
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
