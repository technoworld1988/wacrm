import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/auth/account";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import { logAdminActivity, requirePlatformAdmin } from "@/lib/platform/admin";
import { parsePlanInput } from "@/lib/platform/catalog-input";

export const dynamic = "force-dynamic";

/**
 * PATCH — edit a plan. Clients already on it keep their current limits
 * (they were copied when assigned); new assignments and plan changes
 * use the new values.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { db, userId } = await requirePlatformAdmin();
    const limit = checkRateLimit(`admin-plan:${userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);
    const { key } = await params;

    const parsed = parsePlanInput(await request.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const { data, error } = await db
      .from("platform_plans")
      .update({ ...parsed.value, updated_at: new Date().toISOString() })
      .eq("key", key)
      .select("key");
    if (error) throw error;
    if (!data || data.length === 0) return NextResponse.json({ error: "Plan not found." }, { status: 404 });
    await logAdminActivity(db, { actorUserId: userId, accountId: null, action: "plan_updated", details: { key } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** DELETE — only for plans no client uses; otherwise hide it instead. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { db, userId } = await requirePlatformAdmin();
    const { key } = await params;
    const { data: plan } = await db.from("platform_plans").select("is_builtin").eq("key", key).maybeSingle();
    if (!plan) return NextResponse.json({ error: "Plan not found." }, { status: 404 });
    if (plan.is_builtin) {
      return NextResponse.json({ error: "Built-in plans can't be deleted. Hide it instead." }, { status: 400 });
    }
    const { count } = await db.from("accounts").select("id", { count: "exact", head: true }).eq("plan", key);
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: `${count} client(s) are on this plan. Move them to another plan or hide this one instead.` },
        { status: 409 },
      );
    }
    const { error } = await db.from("platform_plans").delete().eq("key", key);
    if (error) throw error;
    await logAdminActivity(db, { actorUserId: userId, accountId: null, action: "plan_deleted", details: { key } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
