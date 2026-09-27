import { describe, expect, it } from "vitest";
import { PLANS, PLAN_ORDER, getPlan, isUpgrade, withinLimit } from "@/config/plans";
import { PERMISSIONS, SYSTEM_ROLES, hasPermission } from "@/config/permissions";
import { priceFor, verifyStripeSignature } from "@/server/billing/providers";
import { hmacHex } from "../helpers/hmac";

describe("plans", () => {
  it("are ordered by price and limits never shrink on upgrade", () => {
    const plans = PLAN_ORDER.map(getPlan);
    for (let i = 1; i < plans.length; i++) {
      const [prev, next] = [plans[i - 1]!, plans[i]!];
      if (next.monthlyPriceCents !== null && prev.monthlyPriceCents !== null) expect(next.monthlyPriceCents).toBeGreaterThanOrEqual(prev.monthlyPriceCents);
      for (const key of Object.keys(prev.limits) as (keyof typeof prev.limits)[]) {
        const a = prev.limits[key];
        const b = next.limits[key];
        if (typeof a === "number" && typeof b === "number") expect(b < 0 || (a >= 0 && b >= a)).toBe(true);
      }
    }
    expect(PLANS).toHaveLength(PLAN_ORDER.length);
  });

  it("compares plans and limits", () => {
    expect(isUpgrade("FREE", "GROWTH")).toBe(true);
    expect(isUpgrade("SCALE", "STARTER")).toBe(false);
    expect(withinLimit(-1, 10_000)).toBe(true);
    expect(withinLimit(5, 4)).toBe(true);
    expect(withinLimit(5, 5)).toBe(false);
  });

  it("discounts yearly billing", () => {
    expect(priceFor("GROWTH", "YEARLY")).toBeLessThan(priceFor("GROWTH", "MONTHLY") * 12);
  });
});

describe("roles", () => {
  it("only grant known permissions and strictly nest by rank", () => {
    const roles = Object.values(SYSTEM_ROLES).sort((a, b) => b.rank - a.rank);
    for (const r of roles) for (const p of r.permissions) expect(PERMISSIONS).toContain(p);
    for (let i = 1; i < roles.length; i++) {
      for (const p of roles[i]!.permissions) expect(roles[i - 1]!.permissions).toContain(p);
    }
    expect(hasPermission(SYSTEM_ROLES.viewer.permissions, "campaigns:write")).toBe(false);
    expect(hasPermission(SYSTEM_ROLES.owner.permissions, "billing:manage")).toBe(true);
  });
});

describe("stripe webhook signatures", () => {
  it("verifies valid signatures and rejects stale or forged ones", () => {
    const body = JSON.stringify({ id: "evt_1" });
    const t = Math.floor(Date.now() / 1000);
    const sig = hmacHex("whsec_test", `${t}.${body}`);
    expect(verifyStripeSignature(body, `t=${t},v1=${sig}`, "whsec_test")).toBe(true);
    expect(verifyStripeSignature(body, `t=${t},v1=${"0".repeat(64)}`, "whsec_test")).toBe(false);
    expect(verifyStripeSignature(body, `t=${t - 3600},v1=${hmacHex("whsec_test", `${t - 3600}.${body}`)}`, "whsec_test")).toBe(false);
    expect(verifyStripeSignature(body, null, "whsec_test")).toBe(false);
  });
});
