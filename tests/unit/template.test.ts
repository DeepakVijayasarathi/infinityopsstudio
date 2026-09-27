import { describe, expect, it } from "vitest";
import { evaluateCondition, getPath, renderTemplate } from "@/lib/template";

const scope = { lead: { firstName: "Sarah", score: 72, tags: ["webinar", "enterprise"], company: null }, event: { source: "WEBSITE" } };

describe("renderTemplate", () => {
  it("substitutes nested variables and blanks unknown ones", () => {
    expect(renderTemplate("Hi {{ lead.firstName }} from {{event.source}}{{missing.x}}!", scope)).toBe("Hi Sarah from WEBSITE!");
  });
});

describe("getPath", () => {
  it("reads nested paths safely", () => {
    expect(getPath(scope, "lead.score")).toBe(72);
    expect(getPath(scope, "lead.nope.deeper")).toBeUndefined();
  });
});

describe("evaluateCondition", () => {
  it.each([
    ["lead.score", "gte", "70", true],
    ["lead.score", "gt", "72", false],
    ["lead.score", "lt", "80", true],
    ["lead.score", "lte", "71", false],
    ["event.source", "equals", "website", true],
    ["event.source", "not_equals", "website", false],
    ["lead.tags", "contains", "webinar", true],
    ["lead.firstName", "contains", "sar", true],
    ["lead.company", "exists", undefined, false],
    ["lead.company", "not_exists", undefined, true],
  ] as const)("%s %s %s → %s", (field, op, value, expected) => {
    expect(evaluateCondition(scope, field, op, value)).toBe(expected);
  });

  it("never treats non-numeric values as numbers", () => {
    expect(evaluateCondition(scope, "lead.firstName", "gt", "0")).toBe(false);
  });
});
