import { describe, expect, it } from "vitest";
import {
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
