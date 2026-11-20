import { describe, expect, it } from "vitest";
import {
  dueUsageAlert,
  monthKeyIst,
  monthStartIst,
  planLimitColumns,
  planKeyFromName,
  priceFor,
  rowToPlan,
  discountUsable,
  accountAccess,
  clientBucket,
  computeEndDate,
  daysLeft,
  normalizeDomain,
  normalizeHex,
} from "./plans";

const NOW = new Date("2026-11-20T06:00:00Z");

describe("computeEndDate", () => {
  it("adds months from now when there is no current end", () => {
    expect(computeEndDate("1m", null, NOW).toISOString()).toBe("2026-12-20T06:00:00.000Z");
    expect(computeEndDate("12m", null, NOW).toISOString()).toBe("2027-11-20T06:00:00.000Z");
  });
  it("extends from a future end date so early renewals keep their days", () => {
    const end = new Date("2026-11-25T06:00:00Z");
    expect(computeEndDate("1m", end, NOW).toISOString()).toBe("2026-12-25T06:00:00.000Z");
  });
  it("starts from now when the plan already ended", () => {
    const end = new Date("2026-10-01T00:00:00Z");
    expect(computeEndDate("3m", end, NOW).toISOString()).toBe("2027-02-20T06:00:00.000Z");
  });
  it("clamps to month end", () => {
    const jan31 = new Date("2027-01-31T10:00:00Z");
    expect(computeEndDate("1m", null, jan31).toISOString()).toBe("2027-02-28T10:00:00.000Z");
  });
  it("trial is 14 days", () => {
    expect(computeEndDate("trial14", null, NOW).toISOString()).toBe("2026-12-04T06:00:00.000Z");
  });
});

describe("accountAccess", () => {
  it("treats missing status as active (old schema)", () => {
    expect(accountAccess({ status: null, plan_ends_at: null }, NOW)).toBe("ok");
  });
  it("blocks paused and pending", () => {
    expect(accountAccess({ status: "paused", plan_ends_at: null }, NOW)).toBe("paused");
    expect(accountAccess({ status: "pending", plan_ends_at: null }, NOW)).toBe("pending");
  });
  it("blocks a passed end date even before the cron runs", () => {
    expect(accountAccess({ status: "active", plan_ends_at: "2026-11-19T00:00:00Z" }, NOW)).toBe("expired");
  });
  it("allows a running trial", () => {
    expect(accountAccess({ status: "trial", plan_ends_at: "2026-11-30T00:00:00Z" }, NOW)).toBe("ok");
  });
});

describe("clientBucket", () => {
  it("flags renewals due within 7 days", () => {
    expect(clientBucket({ status: "active", plan_ends_at: "2026-11-26T00:00:00Z" }, NOW)).toBe("expiring");
    expect(clientBucket({ status: "active", plan_ends_at: "2026-12-26T00:00:00Z" }, NOW)).toBe("active");
    expect(clientBucket({ status: "trial", plan_ends_at: "2026-12-26T00:00:00Z" }, NOW)).toBe("trial");
    expect(clientBucket({ status: "active", plan_ends_at: null }, NOW)).toBe("active");
  });
  it("counts expired as paused", () => {
    expect(clientBucket({ status: "active", plan_ends_at: "2026-11-01T00:00:00Z" }, NOW)).toBe("paused");
  });
});

describe("helpers", () => {
  it("daysLeft rounds up", () => {
    expect(daysLeft("2026-11-21T00:00:00Z", NOW)).toBe(1);
    expect(daysLeft(null, NOW)).toBeNull();
  });
  it("normalizes colours and domains", () => {
    expect(normalizeHex(" #3e6fd6 ")).toBe("#3E6FD6");
    expect(normalizeHex("blue")).toBeNull();
    expect(normalizeDomain("https://CRM.Example.com/login")).toBe("crm.example.com");
    expect(normalizeDomain("localhost")).toBeNull();
  });
});

describe("billing month (IST)", () => {
  it("starts on the 1st at 00:00 India time", () => {
    // 1 Dec 2026 02:00 IST is still December in India
    expect(monthStartIst(new Date("2026-11-30T20:30:00Z")).toISOString()).toBe("2026-11-30T18:30:00.000Z");
    expect(monthKeyIst(new Date("2026-11-30T20:30:00Z"))).toBe("2026-12");
    // 30 Nov 23:00 IST
    expect(monthKeyIst(new Date("2026-11-30T17:30:00Z"))).toBe("2026-11");
  });
});

describe("dueUsageAlert", () => {
  it("fires 80 then 100 once each", () => {
    expect(dueUsageAlert(799, 1000, 0)).toBeNull();
    expect(dueUsageAlert(800, 1000, 0)).toBe(80);
    expect(dueUsageAlert(900, 1000, 80)).toBeNull();
    expect(dueUsageAlert(1000, 1000, 80)).toBe(100);
    expect(dueUsageAlert(1200, 1000, 100)).toBeNull();
    expect(dueUsageAlert(1000, 1000, 0)).toBe(100);
    expect(dueUsageAlert(5, null, 0)).toBeNull();
  });
});

describe("plan rows", () => {
  const row = {
    key: "website-bonus",
    name: "Website bonus",
    description: "",
    monthly_price: 0,
    yearly_price: null,
    limit_users: 2,
    limit_numbers: 1,
    limit_contacts: 1000,
    limit_ai_replies: 200,
    ai_test_allowance: 50,
    is_bonus: true,
    default_duration: "3m",
    is_active: true,
    is_builtin: false,
    sort_order: 100,
  };
  it("maps a row and its limit columns", () => {
    const p = rowToPlan(row);
    expect(p.defaultDuration).toBe("3m");
    expect(planLimitColumns(p)).toEqual({
      limit_users: 2,
      limit_contacts: 1000,
      limit_ai_replies: 200,
      ai_test_allowance: 50,
    });
  });
  it("makes keys from names", () => {
    expect(planKeyFromName("Website Bonus — 3 Months!")).toBe("website-bonus-3-months");
    expect(planKeyFromName("A")).toBe("plan-a");
  });
});

describe("priceFor", () => {
  const pro = { monthlyPrice: 2799, yearlyPrice: 26999, isBonus: false };
  it("prices periods", () => {
    expect(priceFor(pro, "1m")).toEqual({ base: 2799, discount: 0, total: 2799 });
    expect(priceFor(pro, "3m")?.base).toBe(8397);
    expect(priceFor(pro, "12m")?.base).toBe(26999);
    expect(priceFor({ ...pro, yearlyPrice: null }, "12m")?.base).toBe(33588);
    expect(priceFor(pro, "trial14")?.total).toBe(0);
  });
  it("applies percent and fixed discounts, never below zero", () => {
    expect(priceFor(pro, "1m", { kind: "percent", value: 20 })).toEqual({ base: 2799, discount: 560, total: 2239 });
    expect(priceFor(pro, "1m", { kind: "amount", value: 5000 })).toEqual({ base: 2799, discount: 2799, total: 0 });
  });
  it("bonus plans are free and unpriced plans need a quote", () => {
    expect(priceFor({ ...pro, isBonus: true }, "3m")?.total).toBe(0);
    expect(priceFor({ monthlyPrice: null, yearlyPrice: null, isBonus: false }, "1m")).toBeNull();
  });
});

describe("discountUsable", () => {
  const d = { id: "x", name: "Diwali", kind: "percent" as const, value: 10, note: "", validUntil: "2026-11-21", isActive: true };
  it("is usable through its last day (IST)", () => {
    expect(discountUsable(d, new Date("2026-11-21T18:00:00Z"))).toBe(true); // 23:30 IST
    expect(discountUsable(d, new Date("2026-11-21T18:31:00Z"))).toBe(false); // next day IST
    expect(discountUsable({ ...d, isActive: false }, new Date("2026-11-01T00:00:00Z"))).toBe(false);
  });
});
