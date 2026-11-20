import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/auth/account";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import { logAdminActivity, requirePlatformAdmin } from "@/lib/platform/admin";
import { parseDiscountInput } from "@/lib/platform/catalog-input";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { db, userId } = await requirePlatformAdmin();
    const limit = checkRateLimit(`admin-discount:${userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);
    const { id } = await params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "Discount not found." }, { status: 404 });
    const parsed = parseDiscountInput(await request.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { data, error } = await db.from("platform_discounts").update(parsed.value).eq("id", id).select("id");
    if (error) throw error;
    if (!data || data.length === 0) return NextResponse.json({ error: "Discount not found." }, { status: 404 });
    await logAdminActivity(db, { actorUserId: userId, accountId: null, action: "discount_updated", details: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** DELETE — removes the offer; clients that had it simply lose it. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { db, userId } = await requirePlatformAdmin();
    const { id } = await params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "Discount not found." }, { status: 404 });
    const { error } = await db.from("platform_discounts").delete().eq("id", id);
    if (error) throw error;
    await logAdminActivity(db, { actorUserId: userId, accountId: null, action: "discount_deleted", details: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
