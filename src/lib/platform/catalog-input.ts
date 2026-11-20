// Validation of plan / discount form input from the admin panel.
// Pure: returns either the DB column values or an error message.

import { isDuration } from "./plans";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** null/"" → null (unlimited / not set); integer ≥ min → n; else invalid. */
function optInt(v: unknown, min: number): number | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isInteger(n) || n < min || n > 100_000_000) return undefined;
  return n;
}

export interface PlanColumns {
  name: string;
  description: string;
  monthly_price: number | null;
  yearly_price: number | null;
  limit_users: number | null;
  limit_numbers: number;
  limit_contacts: number | null;
  limit_ai_replies: number | null;
  ai_test_allowance: number | null;
  is_bonus: boolean;
  default_duration: string;
  is_active: boolean;
}

export function parsePlanInput(body: unknown): Result<PlanColumns> {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 60) : "";
  if (!name) return { ok: false, error: "Give the plan a name." };
  const description = typeof b.description === "string" ? b.description.trim().slice(0, 200) : "";

  const monthly = optInt(b.monthlyPrice, 0);
  const yearly = optInt(b.yearlyPrice, 0);
  if (monthly === undefined || yearly === undefined) {
    return { ok: false, error: "Prices must be whole rupees (leave empty if you quote by hand)." };
  }
  const users = optInt(b.users, 1);
  const contacts = optInt(b.contacts, 0);
  const aiReplies = optInt(b.aiReplies, 0);
  const aiTests = optInt(b.aiTests, 0);
  const numbers = optInt(b.numbers, 1);
  if ([users, contacts, aiReplies, aiTests, numbers].some((v) => v === undefined)) {
    return { ok: false, error: "Limits must be whole numbers (leave empty for unlimited)." };
  }
  const isBonus = Boolean(b.isBonus);
  const duration = isDuration(b.defaultDuration) ? b.defaultDuration : isBonus ? "3m" : "1m";

  return {
    ok: true,
    value: {
      name,
      description,
      // A bonus plan is free by definition.
      monthly_price: isBonus ? 0 : monthly ?? null,
      yearly_price: isBonus ? null : yearly ?? null,
      limit_users: users ?? null,
      limit_numbers: numbers ?? 1,
      limit_contacts: contacts ?? null,
      limit_ai_replies: aiReplies ?? null,
      ai_test_allowance: aiTests ?? null,
      is_bonus: isBonus,
      default_duration: duration,
      is_active: b.isActive === undefined ? true : Boolean(b.isActive),
    },
  };
}

export interface DiscountColumns {
  name: string;
  kind: "percent" | "amount";
  value: number;
  note: string;
  valid_until: string | null;
  is_active: boolean;
}

export function parseDiscountInput(body: unknown): Result<DiscountColumns> {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 60) : "";
  if (!name) return { ok: false, error: "Give the discount a name." };
  const kind = b.kind === "amount" ? "amount" : b.kind === "percent" ? "percent" : null;
  if (!kind) return { ok: false, error: "Choose percent or rupees off." };
  const value = optInt(b.value, 1);
  if (value === undefined || value === null) return { ok: false, error: "Enter how much off." };
  if (kind === "percent" && value > 100) return { ok: false, error: "A percent discount can't be more than 100%." };
  let validUntil: string | null = null;
  if (typeof b.validUntil === "string" && b.validUntil.trim()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.validUntil.trim())) return { ok: false, error: "Pick a valid last date." };
    validUntil = b.validUntil.trim();
  }
  return {
    ok: true,
    value: {
      name,
      kind,
      value,
      note: typeof b.note === "string" ? b.note.trim().slice(0, 300) : "",
      valid_until: validUntil,
      is_active: b.isActive === undefined ? true : Boolean(b.isActive),
    },
  };
}
