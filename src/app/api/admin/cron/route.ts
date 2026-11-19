import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/ai/admin-client";
import { logAdminActivity } from "@/lib/platform/admin";
import { RENEWAL_REMINDER_DAYS } from "@/lib/platform/plans";
import { isPushConfigured, sendPushToUsers } from "@/lib/push/web-push";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/cron — daily housekeeping for client plans.
 * Requires `x-cron-secret` = AUTOMATION_CRON_SECRET (same as the other
 * cron routes; called by Supabase pg_cron).
 *
 *   1. Pause accounts whose plan end date has passed.
 *   2. Push a reminder to the platform admin(s) for plans ending in
 *      the next 7 days (once per renewal period).
 */
export async function GET(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET;
  if (!expected) return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  const supplied = Buffer.from(request.headers.get("x-cron-secret") ?? "");
  const want = Buffer.from(expected);
  if (supplied.length !== want.length || !timingSafeEqual(supplied, want)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const now = new Date();

  const { data: expired, error: expErr } = await db
    .from("accounts")
    .update({ status: "paused" })
    .in("status", ["active", "trial"])
    .lte("plan_ends_at", now.toISOString())
    .select("id, name");
  if (expErr) return NextResponse.json({ error: expErr.message }, { status: 500 });
  for (const a of expired ?? []) {
    await logAdminActivity(db, {
      actorUserId: null,
      accountId: a.id as string,
      action: "auto_paused",
      details: { reason: "plan ended" },
    });
  }

  const soon = new Date(now.getTime() + RENEWAL_REMINDER_DAYS * 24 * 60 * 60 * 1000);
  const { data: due, error: dueErr } = await db
    .from("accounts")
    .select("id, name, plan_ends_at")
    .in("status", ["active", "trial"])
    .is("renewal_reminded_at", null)
    .gt("plan_ends_at", now.toISOString())
    .lte("plan_ends_at", soon.toISOString());
  if (dueErr) return NextResponse.json({ error: dueErr.message }, { status: 500 });

  let pushed = 0;
  const notices = [
    ...(due ?? []).map((a) => ({
      title: "Renewal due soon",
      body: `${a.name}: plan ends on ${new Date(a.plan_ends_at as string).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}.`,
    })),
    ...(expired ?? []).map((a) => ({
      title: "Client paused",
      body: `${a.name}: plan ended, account paused until renewed.`,
    })),
  ];

  if (notices.length > 0 && isPushConfigured()) {
    const { data: admins } = await db.from("platform_admins").select("user_id");
    const ids = (admins ?? []).map((a) => a.user_id as string);
    const { data: profiles } = ids.length
      ? await db.from("profiles").select("user_id, account_id").in("user_id", ids)
      : { data: [] as { user_id: string; account_id: string }[] };
    for (const p of profiles ?? []) {
      for (const n of notices) {
        pushed += await sendPushToUsers(db, p.account_id as string, [p.user_id as string], {
          title: n.title,
          body: n.body,
          url: "/admin",
          tag: `renewal-${n.body.slice(0, 40)}`,
        });
      }
    }
  }

  if (due && due.length > 0) {
    await db
      .from("accounts")
      .update({ renewal_reminded_at: now.toISOString() })
      .in(
        "id",
        due.map((a) => a.id as string),
      );
  }

  return NextResponse.json({ paused: expired?.length ?? 0, reminded: due?.length ?? 0, pushed });
}
