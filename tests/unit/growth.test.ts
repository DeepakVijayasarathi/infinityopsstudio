import { describe, expect, it } from "vitest";
import { originAllowed, trafficSource } from "@/server/services/website";
import { normalizeInboundEmail, parseAddress } from "@/server/services/inbox";
import { pageContentSchema } from "@/server/services/landing-pages";
import { ruleCandidates } from "@/server/services/agent";

describe("website helpers", () => {
  it("classifies traffic sources", () => {
    expect(trafficSource(null, "newsletter")).toBe("newsletter");
    expect(trafficSource("https://www.google.co.in/search?q=x", null)).toBe("search");
    expect(trafficSource("https://www.linkedin.com/feed", null)).toBe("LinkedIn");
    expect(trafficSource(null, null)).toBe("direct");
    expect(trafficSource("https://shop.example.com/a", null, "shop.example.com")).toBe("direct");
  });

  it("matches allowed domains and subdomains only", () => {
    expect(originAllowed([], "https://anything.com")).toBe(true);
    expect(originAllowed(["example.com"], "https://www.example.com")).toBe(true);
    expect(originAllowed(["example.com"], "https://example.com.evil.io")).toBe(false);
    expect(originAllowed(["example.com"], "https://notexample.com")).toBe(false);
  });
});

describe("inbound email parsing", () => {
  it("reads names and addresses", () => {
    expect(parseAddress('"Meera Iyer" <Meera@Acme.in>')).toEqual({ email: "meera@acme.in", name: "Meera Iyer" });
    expect(parseAddress("ravi@x.io")).toEqual({ email: "ravi@x.io", name: null });
  });

  it("normalizes Postmark, SendGrid and Mailgun payloads", () => {
    expect(normalizeInboundEmail({ From: "a@b.co", FromName: "Anu", Subject: "Hi", TextBody: "Body", StrippedTextReply: "Reply only", MessageID: "m1" })).toEqual({ email: "a@b.co", name: "Anu", subject: "Hi", body: "Reply only", messageId: "m1" });
    expect(normalizeInboundEmail({ from: "Bo <bo@c.co>", subject: "S", text: " T " })).toMatchObject({ email: "bo@c.co", name: "Bo", body: "T" });
    expect(normalizeInboundEmail({ sender: "cy@d.co", "body-plain": "M", "Message-Id": "<x@y>" })).toMatchObject({ email: "cy@d.co", body: "M", messageId: "<x@y>" });
  });
});

describe("landing page content", () => {
  it("fills defaults and caps lengths", () => {
    const c = pageContentSchema.parse({ hero: { headline: "Hello" } });
    expect(c.form.fields).toEqual(["name", "email", "company"]);
    expect(c.benefits).toEqual([]);
    expect(pageContentSchema.safeParse({ hero: { headline: "x".repeat(200) } }).success).toBe(false);
    expect(pageContentSchema.safeParse({ hero: { headline: "" } }).success).toBe(false);
  });
});

describe("AI Manager rules", () => {
  const base = { company: "Acme", topic: "route planning", focus: null, unreadInbox: 0, hotLeads: [], daysSinceBlog: 3, pages: 1, websiteInstalled: true, platforms: [] as ("LINKEDIN" | "X")[], insights: [] };

  it("proposes nothing when everything is on track", () => {
    expect(ruleCandidates(base)).toEqual([]);
  });

  it("turns signals into concrete actions", () => {
    const out = ruleCandidates({
      ...base,
      focus: "summer sale",
      unreadInbox: 2,
      hotLeads: [{ id: "l1", firstName: "Priya", lastName: "Shah", company: "BigCo" }],
      daysSinceBlog: null,
      websiteInstalled: false,
      platforms: ["X"],
      insights: [{ id: "empty-calendar", severity: "info", category: "social", title: "Nothing scheduled", detail: "" }],
    });
    const types = out.map((c) => c.action.type);
    expect(types).toEqual(["navigate", "create_content", "draft_social_posts", "create_content", "navigate"]);
    expect(out[1]!.title).toBe("Draft a follow-up email to Priya Shah");
    expect(out[2]!.action).toMatchObject({ topic: "summer sale", platforms: ["X"] });
    expect(out[4]!.action).toMatchObject({ href: "/app/website" });
  });
});
