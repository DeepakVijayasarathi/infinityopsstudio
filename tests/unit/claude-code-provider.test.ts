import { describe, expect, it } from "vitest";
import { buildArgs, buildPrompt } from "@/server/ai/providers/claude-code";

describe("Claude Code CLI provider", () => {
  it("passes a single message through unchanged", () => {
    expect(buildPrompt([{ role: "user", content: "Write a tagline" }])).toBe("Write a tagline");
  });

  it("replays earlier turns as a transcript", () => {
    const prompt = buildPrompt([
      { role: "user", content: "Plan a launch" },
      { role: "assistant", content: "Here is a plan" },
      { role: "user", content: "Make it shorter" },
    ]);
    expect(prompt).toContain("User: Plan a launch");
    expect(prompt).toContain("Assistant: Here is a plan");
    expect(prompt.endsWith("Make it shorter")).toBe(true);
  });

  it("runs the CLI text-only with the mapped model and system prompt", () => {
    const args = buildArgs({ model: "claude-code-haiku", system: "Brand context", messages: [], maxTokens: 1000 });
    expect(args).toEqual(expect.arrayContaining(["-p", "--no-session-persistence", "--strict-mcp-config"]));
    expect(args[args.indexOf("--tools") + 1]).toBe(""); // no tools: text generation only
    expect(args[args.indexOf("--model") + 1]).toBe("haiku");
    expect(args[args.indexOf("--system-prompt") + 1]).toBe("Brand context");
    expect(args[args.indexOf("--output-format") + 1]).toBe("stream-json");
  });

  it("falls back to sonnet for unknown model ids", () => {
    const args = buildArgs({ model: "something-else", messages: [], maxTokens: 10 });
    expect(args[args.indexOf("--model") + 1]).toBe("sonnet");
  });
});
