// ============================================================
// Platform plans + account access rules.
//
// Pure module (no DB, no Next imports) so the admin API routes, the
// client shell and the expiry cron share one definition of "is this
// client allowed in?" and "when does a renewal end?".
// ============================================================

export const PLAN_IDS = ["starter", "pro", "ultra", "custom"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const ACCOUNT_STATUSES = ["active", "trial", "paused", "pending"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const DURATIONS = ["trial14", "1m", "3m", "12m"] as const;
export type Duration = (typeof DURATIONS)[number];

export interface PlanMeta {
  id: PlanId;
  name: string;
  /** Monthly price in INR, before GST. Null for custom quotes. */
  monthlyInr: number | null;
  yearlyInr: number | null;
  limits: {
    users: number | null;
    numbers: number;
    contacts: number | null;
    aiReplies: number;
  };
}

export const PLANS: Record<PlanId, PlanMeta> = {
  starter: {
    id: "starter",
    name: "Starter",
    monthlyInr: 1199,
    yearlyInr: 9999,
    limits: { users: 2, numbers: 1, contacts: 5000, aiReplies: 300 },
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthlyInr: 2799,
    yearlyInr: 26999,
    limits: { users: 6, numbers: 1, contacts: 50000, aiReplies: 1000 },
  },
  ultra: {
    id: "ultra",
    name: "Ultra",
    monthlyInr: 6999,
    yearlyInr: 69999,
    limits: { users: 15, numbers: 3, contacts: null, aiReplies: 3000 },
  },
  custom: {
    id: "custom",
    name: "Custom (single client)",
    monthlyInr: 2999,
    yearlyInr: null,
    limits: { users: null, numbers: 1, contacts: null, aiReplies: 1000 },
  },
};

export const DURATION_LABELS: Record<Duration, string> = {
  trial14: "14-day free trial",
  "1m": "1 month",
  "3m": "3 months",
  "12m": "12 months",
};

export function isPlanId(v: unknown): v is PlanId {
  return typeof v === "string" && (PLAN_IDS as readonly string[]).includes(v);
}
export function isDuration(v: unknown): v is Duration {
  return typeof v === "string" && (DURATIONS as readonly string[]).includes(v);
}
export function isAccountStatus(v: unknown): v is AccountStatus {
  return typeof v === "string" && (ACCOUNT_STATUSES as readonly string[]).includes(v);
}

/** Days before the end date at which we remind the operator. */
export const RENEWAL_REMINDER_DAYS = 7;

/**
 * New end date for a renewal. Extends from the current end date when
 * the plan is still running (renewing early never loses days), else
 * from `now`. Month arithmetic clamps to the last day of the month
 * (Jan 31 + 1 month = Feb 28/29).
 */
export function computeEndDate(
  duration: Duration,
  currentEnd: Date | null,
  now: Date = new Date(),
): Date {
  const base =
    currentEnd && currentEnd.getTime() > now.getTime() ? new Date(currentEnd) : new Date(now);
  if (duration === "trial14") {
    return new Date(base.getTime() + 14 * 24 * 60 * 60 * 1000);
  }
  const months = duration === "1m" ? 1 : duration === "3m" ? 3 : 12;
  const day = base.getUTCDate();
  const target = new Date(base);
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

export type AccessState = "ok" | "paused" | "pending" | "expired";

export interface AccessInput {
  status: string | null | undefined;
  plan_ends_at: string | null | undefined;
}

/**
 * Whether members of an account may use the app.
 *
 * `null` status (pre-061 schema) counts as active so an old database
 * never locks everyone out. An end date in the past blocks access even
 * before the daily cron has flipped the status to 'paused'.
 */
export function accountAccess(input: AccessInput, now: Date = new Date()): AccessState {
  const status = input.status ?? "active";
  if (status === "paused") return "paused";
  if (status === "pending") return "pending";
  if (input.plan_ends_at) {
    const end = new Date(input.plan_ends_at);
    if (!Number.isNaN(end.getTime()) && end.getTime() <= now.getTime()) {
      return "expired";
    }
  }
  return "ok";
}

/** Whole days left until `end` (negative when past). */
export function daysLeft(end: string | null | undefined, now: Date = new Date()): number | null {
  if (!end) return null;
  const t = new Date(end).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - now.getTime()) / (24 * 60 * 60 * 1000));
}

export type ClientBucket = "active" | "trial" | "expiring" | "paused" | "pending";

/** Which dashboard counter / badge a client falls into. */
export function clientBucket(input: AccessInput, now: Date = new Date()): ClientBucket {
  const access = accountAccess(input, now);
  if (access === "paused" || access === "expired") return "paused";
  if (access === "pending") return "pending";
  const left = daysLeft(input.plan_ends_at, now);
  if (left !== null && left <= RENEWAL_REMINDER_DAYS) return "expiring";
  return input.status === "trial" ? "trial" : "active";
}

/** Normalise an operator-entered hex colour, or null when invalid. */
export function normalizeHex(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toUpperCase() : null;
}

/** Lower-cased bare hostname, or null when it isn't a plausible domain. */
export function normalizeDomain(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s) ? s : null;
}
