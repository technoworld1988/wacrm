import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/auth/account";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import { logAdminActivity, requirePlatformAdmin } from "@/lib/platform/admin";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
const MAX_BYTES = 1024 * 1024;

/** POST (multipart `file`) — upload a white-label logo. DELETE — remove it. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db, userId } = await requirePlatformAdmin();
    const limit = checkRateLimit(`admin-logo:${userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);
    const { id } = await params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "Client not found." }, { status: 404 });

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose an image file." }, { status: 400 });
    }
    const ext = TYPES[file.type];
    if (!ext) {
      return NextResponse.json({ error: "Logo must be PNG, JPG or WebP." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Logo must be under 1 MB." }, { status: 400 });
    }

    const path = `${id}/logo-${Date.now()}.${ext}`;
    const { error: upErr } = await db.storage
      .from("brand-assets")
      .upload(path, Buffer.from(await file.arrayBuffer()), {
        contentType: file.type,
        upsert: false,
      });
    if (upErr) throw upErr;
    const { data: pub } = db.storage.from("brand-assets").getPublicUrl(path);

    const { error } = await db.from("accounts").update({ brand_logo_url: pub.publicUrl }).eq("id", id);
    if (error) throw error;
    await logAdminActivity(db, { actorUserId: userId, accountId: id, action: "logo_uploaded" });
    return NextResponse.json({ logoUrl: pub.publicUrl });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db, userId } = await requirePlatformAdmin();
    const { id } = await params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "Client not found." }, { status: 404 });
    const { error } = await db.from("accounts").update({ brand_logo_url: null }).eq("id", id);
    if (error) throw error;
    await logAdminActivity(db, { actorUserId: userId, accountId: id, action: "logo_removed" });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
