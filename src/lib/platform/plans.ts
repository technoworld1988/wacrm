// ============================================================
// Platform plans, discounts + account access rules.
//
// The plan catalogue lives in `platform_plans` (migration 063) so the
// operator can create their own; this module holds the pure helpers
// that shape and price those rows.
//
// Pure module (no DB, no Next imports) so the admin API routes, the
// client shell and the expiry cron share one definition of "is this
// client allowed in?" and "when does a renewal end?".
// ============================================================

export const ACCOUNT_STATUSES = ["active", "trial", "paused", "pending"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const DURATIONS = ["trial14", "1m", "3m", "12m"] as const;
export type Duration = (typeof DURATIONS)[number];

export const DURATION_LABELS: Record<Duration, string> = {
  trial14: "14-day free trial",
  "1m": "1 month",
  "3m": "3 months",
  "12m": "12 months",
};

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

/**
 * Start of the current billing month: the 1st at 00:00 India time,
 * returned as a UTC Date. AI allowances reset then.
 */
export function monthStartIst(now: Date = new Date()): Date {
  const IST_MS = 330 * 60 * 1000;
  const local = new Date(now.getTime() + IST_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - IST_MS);
}

/** "2026-11" — the IST month key used to remember sent usage alerts. */
export function monthKeyIst(now: Date = new Date()): string {
  const start = new Date(monthStartIst(now).getTime() + 330 * 60 * 1000);
  return `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Which usage alert (0, 80 or 100) is due given usage and what was
 * already sent this month. Returns null when nothing new to send.
 */
export function dueUsageAlert(
  used: number,
  limit: number | null,
  alreadySent: number,
): 80 | 100 | null {
  if (limit === null || limit <= 0) return null;
  const pct = (used / limit) * 100;
  if (pct >= 100 && alreadySent < 100) return 100;
  if (pct >= 80 && alreadySent < 80) return 80;
  return null;
}

// ---- Plan catalogue rows ------------------------------------------

export interface PlatformPlan {
  key: string;
  name: string;
  description: string;
  monthlyPrice: number | null;
  yearlyPrice: number | null;
  limits: {
    users: number | null;
    numbers: number;
    contacts: number | null;
    aiReplies: number | null;
    aiTests: number | null;
  };
  /** Free add-on given with another service (website, ads, video…). */
  isBonus: boolean;
  defaultDuration: Duration;
  isActive: boolean;
  isBuiltin: boolean;
  sortOrder: number;
}

export const PLAN_COLUMNS =
  "key, name, description, monthly_price, yearly_price, limit_users, limit_numbers, limit_contacts, limit_ai_replies, ai_test_allowance, is_bonus, default_duration, is_active, is_builtin, sort_order";

export function rowToPlan(r: Record<string, unknown>): PlatformPlan {
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  return {
    key: String(r.key),
    name: String(r.name),
    description: typeof r.description === "string" ? r.description : "",
    monthlyPrice: num(r.monthly_price),
    yearlyPrice: num(r.yearly_price),
    limits: {
      users: num(r.limit_users),
      numbers: num(r.limit_numbers) ?? 1,
      contacts: num(r.limit_contacts),
      aiReplies: num(r.limit_ai_replies),
      aiTests: num(r.ai_test_allowance),
    },
    isBonus: Boolean(r.is_bonus),
    defaultDuration: isDuration(r.default_duration) ? r.default_duration : "1m",
    isActive: r.is_active !== false,
    isBuiltin: Boolean(r.is_builtin),
    sortOrder: num(r.sort_order) ?? 100,
  };
}

/** Column values for `accounts` when a client is put on `plan`. */
export function planLimitColumns(plan: PlatformPlan): {
  limit_users: number | null;
  limit_contacts: number | null;
  limit_ai_replies: number | null;
  ai_test_allowance: number | null;
} {
  return {
    limit_users: plan.limits.users,
    limit_contacts: plan.limits.contacts,
    limit_ai_replies: plan.limits.aiReplies,
    ai_test_allowance: plan.limits.aiTests,
  };
}

/** URL-safe key for a new plan name: "Website Bonus 3M" → "website-bonus-3m". */
export function planKeyFromName(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
  return base.length >= 2 ? base : `plan-${base || "x"}`;
}

// ---- Discounts ------------------------------------------------------

export interface PlatformDiscount {
  id: string;
  name: string;
  kind: "percent" | "amount";
  value: number;
  note: string;
  validUntil: string | null;
  isActive: boolean;
}

export const DISCOUNT_COLUMNS = "id, name, kind, value, note, valid_until, is_active";

export function rowToDiscount(r: Record<string, unknown>): PlatformDiscount {
  return {
    id: String(r.id),
    name: String(r.name),
    kind: r.kind === "amount" ? "amount" : "percent",
    value: typeof r.value === "number" ? r.value : 0,
    note: typeof r.note === "string" ? r.note : "",
    validUntil: typeof r.valid_until === "string" ? r.valid_until : null,
    isActive: r.is_active !== false,
  };
}

/** Today's date in India as YYYY-MM-DD. */
export function todayIst(now: Date = new Date()): string {
  return new Date(now.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
}

/** An offer can still be given out: active and not past its last day. */
export function discountUsable(d: PlatformDiscount, now: Date = new Date()): boolean {
  return d.isActive && (!d.validUntil || d.validUntil >= todayIst(now));
}

export function discountLabel(d: Pick<PlatformDiscount, "kind" | "value">): string {
  return d.kind === "percent" ? `${d.value}% off` : `₹${d.value.toLocaleString("en-IN")} off`;
}

export interface PriceBreakdown {
  /** Plan price for the period, before discount (₹, before GST). */
  base: number;
  discount: number;
  /** What to collect (never below 0). */
  total: number;
}

/**
 * Price for one billing period of `plan` with an optional discount.
 * 12-month periods use the yearly price when the plan has one, else
 * 12 × monthly. Bonus plans and 14-day trials cost 0. Null when the
 * plan has no price set (quote by hand).
 */
export function priceFor(
  plan: Pick<PlatformPlan, "monthlyPrice" | "yearlyPrice" | "isBonus">,
  duration: Duration,
  discount?: Pick<PlatformDiscount, "kind" | "value"> | null,
): PriceBreakdown | null {
  if (plan.isBonus || duration === "trial14") return { base: 0, discount: 0, total: 0 };
  let base: number | null;
  if (duration === "12m") {
    base = plan.yearlyPrice ?? (plan.monthlyPrice !== null ? plan.monthlyPrice * 12 : null);
  } else {
    base = plan.monthlyPrice !== null ? plan.monthlyPrice * (duration === "3m" ? 3 : 1) : null;
  }
  if (base === null) return null;
  let off = 0;
  if (discount) {
    off = discount.kind === "percent" ? Math.round((base * discount.value) / 100) : discount.value;
  }
  off = Math.min(off, base);
  return { base, discount: off, total: base - off };
}

export function inr(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : `₹${n.toLocaleString("en-IN")}`;
}
