import { describe, expect, it } from "vitest";
import { parseDiscountInput, parsePlanInput } from "./catalog-input";

describe("parsePlanInput", () => {
  it("accepts a paid plan with unlimited fields left empty", () => {
    const r = parsePlanInput({ name: "Meta Ads combo", monthlyPrice: "1999", users: "3", contacts: "", aiReplies: 500, aiTests: "" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.monthly_price).toBe(1999);
      expect(r.value.limit_contacts).toBeNull();
      expect(r.value.limit_numbers).toBe(1);
      expect(r.value.default_duration).toBe("1m");
    }
  });
  it("forces bonus plans to be free and defaults them to 3 months", () => {
    const r = parsePlanInput({ name: "Website bonus", isBonus: true, monthlyPrice: 999, yearlyPrice: 9999 });
    expect(r.ok && r.value.monthly_price).toBe(0);
    expect(r.ok && r.value.yearly_price).toBeNull();
    expect(r.ok && r.value.default_duration).toBe("3m");
  });
  it("rejects bad input", () => {
    expect(parsePlanInput({ name: "" }).ok).toBe(false);
    expect(parsePlanInput({ name: "X", monthlyPrice: "12.5" }).ok).toBe(false);
    expect(parsePlanInput({ name: "X", users: 0 }).ok).toBe(false);
  });
});

describe("parseDiscountInput", () => {
  it("accepts percent and rupee discounts", () => {
    expect(parseDiscountInput({ name: "Diwali", kind: "percent", value: "20", validUntil: "2026-11-30" })).toMatchObject({
      ok: true,
      value: { kind: "percent", value: 20, valid_until: "2026-11-30" },
    });
    expect(parseDiscountInput({ name: "Loyal", kind: "amount", value: 500 })).toMatchObject({ ok: true });
  });
  it("rejects bad input", () => {
    expect(parseDiscountInput({ name: "X", kind: "percent", value: 150 }).ok).toBe(false);
    expect(parseDiscountInput({ name: "X", kind: "other", value: 5 }).ok).toBe(false);
    expect(parseDiscountInput({ name: "X", kind: "amount", value: 0 }).ok).toBe(false);
    expect(parseDiscountInput({ name: "X", kind: "amount", value: 5, validUntil: "30/11/2026" }).ok).toBe(false);
  });
});
