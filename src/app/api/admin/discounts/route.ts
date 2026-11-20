import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/auth/account";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import { logAdminActivity, requirePlatformAdmin } from "@/lib/platform/admin";
import { parseDiscountInput } from "@/lib/platform/catalog-input";

export const dynamic = "force-dynamic";

/** POST — create a discount offer. (Listing is part of GET /api/admin/plans.) */
export async function POST(request: Request) {
  try {
    const { db, userId } = await requirePlatformAdmin();
    const limit = checkRateLimit(`admin-discount:${userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);
    const parsed = parseDiscountInput(await request.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { data, error } = await db.from("platform_discounts").insert(parsed.value).select("id").single();
    if (error) throw error;
    await logAdminActivity(db, { actorUserId: userId, accountId: null, action: "discount_created", details: { name: parsed.value.name } });
    return NextResponse.json({ id: data.id });
  } catch (err) {
    return toErrorResponse(err);
  }
}
