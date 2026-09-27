import { describe, expect, it } from "vitest";
import { scoreLead } from "@/server/services/leads";

const base = { source: "WEBSITE" as const, status: "NEW" as const };

describe("scoreLead", () => {
  it("rewards senior titles over junior ones", () => {
    const exec = scoreLead({ ...base, email: "a@x.com", jobTitle: "VP Marketing" });
    const ic = scoreLead({ ...base, email: "a@x.com", jobTitle: "Coordinator" });
    expect(exec).toBeGreaterThan(ic);
  });

  it("increases with pipeline stage and engagement", () => {
    const lead = { ...base, email: "a@x.com", company: "Acme" };
    const fresh = scoreLead(lead);
    const qualified = scoreLead({ ...lead, status: "QUALIFIED" });
    const engaged = scoreLead({ ...lead, status: "QUALIFIED" }, { opens: 3, clicks: 2, activities: 1 });
    expect(qualified).toBeGreaterThan(fresh);
    expect(engaged).toBeGreaterThan(qualified);
  });

  it("is clamped to 0–100", () => {
    const max = scoreLead(
      { email: "a@x.com", phone: "1", company: "A", website: "a.com", jobTitle: "CEO", source: "REFERRAL", status: "WON" },
      { opens: 100, clicks: 100, activities: 100 },
    );
    expect(max).toBeLessThanOrEqual(100);
    expect(scoreLead({ ...base })).toBeGreaterThanOrEqual(0);
  });
});
