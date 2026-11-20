// ============================================================
// Monthly AI allowance per account (migration 062).
//
// "AI replies" = live auto-replies + agent drafts, i.e. every LLM call
// that serves a real customer. Test-chat calls ('test') are counted
// apart against `ai_test_allowance`, so a client polishing their bot
// never burns the replies they paid for. NULL limit = unlimited.
//
// All helpers take the service-role client and never throw on a
// counting failure: if we can't count, we allow (fail-open) — a DB
// hiccup must not silence a business's WhatsApp bot. The cost of a
// rare over-run is a few paise; the cost of a silent bot is a lost
// customer.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { dueUsageAlert, monthKeyIst, monthStartIst } from "./plans";
import { isPushConfigured, sendPushToUsers } from "@/lib/push/web-push";

export interface AiAllowance {
  replies: { used: number; limit: number | null };
  tests: { used: number; limit: number | null };
  /** ISO start of the current billing month (IST). */
  periodStart: string;
}

async function countSince(
  db: SupabaseClient,
  accountId: string,
  modes: string[],
  since: Date,
): Promise<number> {
  const { count, error } = await db
    .from("ai_usage_log")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .in("mode", modes)
    .gte("created_at", since.toISOString());
  if (error) throw error;
  return count ?? 0;
}

export async function getAiAllowance(
  db: SupabaseClient,
  accountId: string,
  now: Date = new Date(),
): Promise<AiAllowance> {
  const since = monthStartIst(now);
  const [{ data: acc }, replies, tests] = await Promise.all([
    db
      .from("accounts")
      .select("limit_ai_replies, ai_test_allowance")
      .eq("id", accountId)
      .maybeSingle(),
    countSince(db, accountId, ["auto_reply", "draft"], since),
    countSince(db, accountId, ["test"], since),
  ]);
  return {
    replies: { used: replies, limit: (acc?.limit_ai_replies as number | null) ?? null },
    tests: { used: tests, limit: (acc?.ai_test_allowance as number | null) ?? null },
    periodStart: since.toISOString(),
  };
}

/**
 * Whether one more AI call of `kind` fits this month's allowance.
 * Fails open (returns true) when the count can't be read.
 */
export async function hasAiAllowance(
  db: SupabaseClient,
  accountId: string,
  kind: "reply" | "test",
): Promise<boolean> {
  try {
    const a = await getAiAllowance(db, accountId);
    const bucket = kind === "reply" ? a.replies : a.tests;
    return bucket.limit === null || bucket.used < bucket.limit;
  } catch (err) {
    console.error("[ai allowance] check failed, allowing:", err);
    return true;
  }
}

/**
 * After a reply is logged: push an alert to the account's owner/admins
 * when usage crosses 80 % or 100 % of the monthly replies (once each per
 * month), and tell the platform admin at 100 % (a top-up to sell).
 * Best-effort; never throws.
 */
export async function maybeAlertAiUsage(db: SupabaseClient, accountId: string): Promise<void> {
  try {
    const { data: acc } = await db
      .from("accounts")
      .select("name, limit_ai_replies, ai_alert_month, ai_alert_level")
      .eq("id", accountId)
      .maybeSingle();
    if (!acc || acc.limit_ai_replies === null) return;
    const month = monthKeyIst();
    const sent = acc.ai_alert_month === month ? (acc.ai_alert_level as number) : 0;
    // Cheap pre-check before counting: nothing left to send this month.
    if (sent >= 100) return;
    const used = await countSince(db, accountId, ["auto_reply", "draft"], monthStartIst());
    const level = dueUsageAlert(used, acc.limit_ai_replies as number, sent);
    if (!level) return;

    // Claim the alert atomically so two concurrent replies don't both send it.
    const { data: claimed } = await db
      .from("accounts")
      .update({ ai_alert_month: month, ai_alert_level: level })
      .eq("id", accountId)
      .or(`ai_alert_month.is.null,ai_alert_month.neq.${month},ai_alert_level.lt.${level}`)
      .select("id");
    if (!claimed || claimed.length === 0) return;
    if (!isPushConfigured()) return;

    const limit = acc.limit_ai_replies as number;
    const { data: members } = await db
      .from("profiles")
      .select("user_id, account_role")
      .eq("account_id", accountId)
      .in("account_role", ["owner", "admin"]);
    const body =
      level === 100
        ? `All ${limit.toLocaleString("en-IN")} AI replies for this month are used. The bot is paused until next month or a top-up — messages still arrive in your inbox.`
        : `${used.toLocaleString("en-IN")} of ${limit.toLocaleString("en-IN")} AI replies used this month.`;
    await sendPushToUsers(
      db,
      accountId,
      (members ?? []).map((m) => m.user_id as string),
      { title: level === 100 ? "AI replies used up" : "AI replies 80% used", body, url: "/agents", tag: `ai-usage-${level}` },
    );

    if (level === 100) {
      const { data: admins } = await db.from("platform_admins").select("user_id");
      const ids = (admins ?? []).map((a) => a.user_id as string);
      if (ids.length) {
        const { data: profiles } = await db.from("profiles").select("user_id, account_id").in("user_id", ids);
        for (const p of profiles ?? []) {
          await sendPushToUsers(db, p.account_id as string, [p.user_id as string], {
            title: "Client out of AI replies",
            body: `${acc.name} used all ${limit.toLocaleString("en-IN")} AI replies this month. Offer a top-up.`,
            url: `/admin/clients/${accountId}`,
            tag: `ai-out-${accountId}`,
          });
        }
      }
    }
  } catch (err) {
    console.error("[ai usage alert] skipped:", err);
  }
}
