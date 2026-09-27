import { describe, expect, it } from "vitest";
import { MODEL_CATALOG, calculateCostMicros, creditsFor, estimateTokens, findModel } from "@/server/ai/models";
import { localProvider } from "@/server/ai/providers/local";

describe("model catalog", () => {
  it("has unique ids and positive pricing", () => {
    const ids = MODEL_CATALOG.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Local and Claude Code models are billed outside the app, so they carry no per-token price.
    for (const m of MODEL_CATALOG.filter((m) => m.provider !== "local" && m.provider !== "claude-code")) {
      expect(m.inputPerMTok).toBeGreaterThan(0);
      expect(m.outputPerMTok).toBeGreaterThan(m.inputPerMTok);
    }
  });

  it("prices requests in micro-dollars", () => {
    const m = findModel("claude-sonnet-5")!;
    expect(calculateCostMicros("claude-sonnet-5", 1_000_000, 0)).toBe(m.inputPerMTok * 1_000_000);
    expect(calculateCostMicros("claude-sonnet-5", 1000, 500)).toBe(Math.round(1000 * m.inputPerMTok + 500 * m.outputPerMTok));
  });

  it("honours admin pricing overrides and unknown models", () => {
    expect(calculateCostMicros("claude-sonnet-5", 10, 10, { "claude-sonnet-5": { inputPerMTok: 1, outputPerMTok: 1 } })).toBe(20);
    expect(calculateCostMicros("nope", 1000, 1000)).toBe(0);
  });

  it("charges one credit per 1k tokens, minimum one", () => {
    expect(creditsFor(1, 1)).toBe(1);
    expect(creditsFor(1500, 600)).toBe(3);
    expect(estimateTokens("a".repeat(400))).toBe(100);
  });
});

describe("local demo provider", () => {
  const system = "Company: Northwind Logistics\nTarget audience: Operations leaders at mid-size 3PLs (50–1,000 employees)";
  const gen = (content: string) => localProvider.generate({ model: "infinity-local", system, messages: [{ role: "user", content }], maxTokens: 1000 });

  it("routes blog requests to a long-form article", async () => {
    const r = await gen("Write a blog article.\nTopic: Five signs your routes are costing you money");
    expect(r.text).toMatch(/^# Five signs your routes/);
    expect(r.text).toContain("operations leaders at mid-size 3PLs");
  });

  it("routes social requests to per-platform posts", async () => {
    const r = await gen("Write social posts.\nTopic: Our new fleet insights dashboard");
    expect(r.text).toContain("**LinkedIn**");
    expect(r.text).toMatch(/#fleet|#insights|#dashboard/);
  });

  it("applies inline transforms to the source text", async () => {
    const r = await gen("Shorten this text\n---\nFirst sentence. Second sentence. Third sentence. Fourth sentence.");
    expect(r.text).toBe("First sentence. Second sentence.");
  });

  it("reports usage and streams the same text", async () => {
    const prompt = "Create a strategy.\nGoal: Grow qualified pipeline";
    const r = await gen(prompt);
    expect(r.promptTokens).toBeGreaterThan(0);
    expect(r.completionTokens).toBeGreaterThan(0);
    let streamed = "";
    for await (const chunk of localProvider.stream({ model: "infinity-local", system, messages: [{ role: "user", content: prompt }], maxTokens: 1000 })) {
      if (chunk.type === "text") streamed += chunk.text;
    }
    expect(streamed).toBe(r.text);
  });

  it("writes the requested number of separate posts for batch requests", async () => {
    const r = await gen("Write 3 distinct LinkedIn social posts for this campaign.\nTopic: our spring launch\nSeparate posts with a line containing only ===");
    expect(r.text.split(/\n\s*===\s*\n/)).toHaveLength(3);
  });
});
