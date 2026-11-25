import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/auth/account";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import { logAdminActivity, requirePlatformAdmin } from "@/lib/platform/admin";
import { loadDiscounts, loadPlans } from "@/lib/platform/catalog";
import { parsePlanInput } from "@/lib/platform/catalog-input";
import { planKeyFromName } from "@/lib/platform/plans";

export const dynamic = "force-dynamic";

/** GET — every plan (with how many clients use it) and every discount. */
export async function GET() {
  try {
    const { db } = await requirePlatformAdmin();
    const [plans, discounts, accounts] = await Promise.all([
      loadPlans(db),
      loadDiscounts(db),
      db.from("accounts").select("plan, discount_id").eq("is_demo", false),
    ]);
    if (accounts.error) throw accounts.error;
    const planUse = new Map<string, number>();
    const discountUse = new Map<string, number>();
    for (const a of accounts.data ?? []) {
      if (a.plan) planUse.set(a.plan as string, (planUse.get(a.plan as string) ?? 0) + 1);
      if (a.discount_id) discountUse.set(a.discount_id as string, (discountUse.get(a.discount_id as string) ?? 0) + 1);
    }
    return NextResponse.json({
      plans: plans.map((p) => ({ ...p, clients: planUse.get(p.key) ?? 0 })),
      discounts: discounts.map((d) => ({ ...d, clients: discountUse.get(d.id) ?? 0 })),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** POST — create a plan. */
export async function POST(request: Request) {
  try {
    const { db, userId } = await requirePlatformAdmin();
    const limit = checkRateLimit(`admin-plan:${userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const parsed = parsePlanInput(await request.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    // Unique key from the name; add a suffix if it's taken.
    const base = planKeyFromName(parsed.value.name);
    let key = base;
    for (let i = 2; i < 50; i++) {
      const { data } = await db.from("platform_plans").select("key").eq("key", key).maybeSingle();
      if (!data) break;
      key = `${base.slice(0, 36)}-${i}`;
    }

    const { error } = await db.from("platform_plans").insert({ key, ...parsed.value, sort_order: 100 });
    if (error) throw error;
    await logAdminActivity(db, { actorUserId: userId, accountId: null, action: "plan_created", details: { key, name: parsed.value.name } });
    return NextResponse.json({ key });
  } catch (err) {
    return toErrorResponse(err);
  }
}
