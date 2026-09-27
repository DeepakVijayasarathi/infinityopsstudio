import { describe, expect, it } from "vitest";
import { detectAnomaly, weekOverWeek } from "@/server/services/insights";
import { scoreBreakdown, scoreLead } from "@/server/services/leads";

const flat = (n: number, v: number) => Array.from({ length: n }, (_, i) => v + (i % 3) - 1); // gentle noise

describe("detectAnomaly", () => {
  it("flags a sharp drop in the last 3 days", () => {
    const a = detectAnomaly([...flat(14, 100), 40, 45, 38]);
    expect(a?.kind).toBe("drop");
    expect(a!.change).toBeLessThan(-0.5);
  });

  it("flags a spike", () => {
    expect(detectAnomaly([...flat(14, 100), 180, 170, 190])?.kind).toBe("spike");
  });

  it("ignores normal variation and tiny volumes", () => {
    expect(detectAnomaly([...flat(14, 100), 92, 97, 95])).toBeNull();
    expect(detectAnomaly([...flat(14, 2), 0, 0, 0])).toBeNull();
    expect(detectAnomaly([1, 2, 3])).toBeNull();
  });
});

describe("weekOverWeek", () => {
  it("compares the last 7 days with the 7 before", () => {
    expect(weekOverWeek([...Array(7).fill(10), ...Array(7).fill(15)])).toBeCloseTo(0.5);
    expect(weekOverWeek([...Array(7).fill(0), ...Array(7).fill(5)])).toBeNull();
  });
});

describe("scoreBreakdown", () => {
  it("adds up to the lead score", () => {
    const lead = { email: "a@x.com", phone: "1", company: "Acme", jobTitle: "VP Sales", source: "REFERRAL" as const, status: "QUALIFIED" as const };
    const engagement = { opens: 2, clicks: 1, activities: 3 };
    const total = scoreBreakdown(lead, engagement).reduce((a, f) => a + f.points, 0);
    expect(total).toBe(scoreLead(lead, engagement));
    for (const f of scoreBreakdown(lead, engagement)) expect(f.points).toBeLessThanOrEqual(f.max);
  });
});
