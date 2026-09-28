import { describe, expect, it } from "vitest";
import { afterWakeWord, parseCommand, toSpeech, voiceSupport } from "@/lib/voice";

describe("toSpeech", () => {
  it("strips markdown, links and emoji", () => {
    expect(toSpeech("## Hot leads\n- **Priya Shah** at [BigCo](/app/leads/1) 🔥\n- Raj")).toBe("Hot leads. Priya Shah at BigCo. Raj.");
  });

  it("replaces tables with a pointer to the screen", () => {
    expect(toSpeech("Here's this month:\n\n| Metric | Value |\n|---|---|\n| Leads | 12 |")).toBe("Here's this month: The details are on screen.");
  });

  it("keeps spoken answers short", () => {
    const long = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} is here.`).join("\n");
    const out = toSpeech(long, 120);
    expect(out.length).toBeLessThan(170);
    expect(out).toMatch(/rest on screen\.$/);
  });
});

describe("parseCommand", () => {
  it("recognises approvals", () => {
    expect(parseCommand("Yes.")).toEqual({ kind: "approve", all: false });
    expect(parseCommand("go ahead please")).toEqual({ kind: "approve", all: false });
    expect(parseCommand("approve all")).toEqual({ kind: "approve", all: true });
  });

  it("recognises dismiss, stop and goodbye", () => {
    expect(parseCommand("No thanks")).toEqual({ kind: "dismiss" });
    expect(parseCommand("stop")).toEqual({ kind: "stop" });
    expect(parseCommand("Goodbye!")).toEqual({ kind: "sleep" });
  });

  it("leaves real questions for Copilot", () => {
    expect(parseCommand("yes, and which leads should I call today?")).toBeNull();
    expect(parseCommand("How are we doing?")).toBeNull();
  });
});

describe("afterWakeWord", () => {
  const words = ["hey jarvis", "jarvis", "hey copilot"];
  it("returns what follows the wake word", () => {
    expect(afterWakeWord("Hey Jarvis, how are we doing this month?", words)).toBe("how are we doing this month?");
    expect(afterWakeWord("jarvis", words)).toBe("");
  });
  it("ignores speech without it", () => {
    expect(afterWakeWord("let's check the report", words)).toBeNull();
  });
});

describe("voiceSupport", () => {
  it("reports unsupported outside a browser", () => {
    expect(voiceSupport()).toEqual({ ok: false, reason: "unsupported" });
  });
});
