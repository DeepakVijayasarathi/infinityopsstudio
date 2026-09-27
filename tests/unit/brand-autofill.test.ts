import { describe, expect, it } from "vitest";
import { extractFacts } from "@/server/services/brand-autofill";
import { campaignName, inferObjective, parseEmail, splitPosts } from "@/server/services/autopilot";

const html = `<!doctype html><html><head>
<title>Harbor Coffee | Single-origin coffee roasters in Chennai</title>
<meta property="og:site_name" content="Harbor Coffee">
<meta name="description" content="Small-batch, single-origin coffee roasted fresh every week &amp; delivered to your door.">
<meta name="theme-color" content="#7B3F00">
<link rel="apple-touch-icon" href="/icon-180.png">
<script>var x = "ignore me";</script>
</head><body><nav>Menu</nav><h1>Coffee worth waking up for</h1><h2>Subscriptions</h2><h2>Wholesale for cafes</h2><p>Roasted in Chennai.</p></body></html>`;

describe("extractFacts", () => {
  const f = extractFacts(html, new URL("https://harbor.example/shop"));
  it("reads name, tagline, colour and logo from the page", () => {
    expect(f.companyName).toBe("Harbor Coffee");
    expect(f.tagline).toBe("Coffee worth waking up for");
    expect(f.description).toContain("& delivered");
    expect(f.themeColor).toBe("#7B3F00");
    expect(f.logoUrl).toBe("https://harbor.example/icon-180.png");
    expect(f.url).toBe("https://harbor.example");
    expect(f.industry).toBe("Food & beverage");
  });
  it("drops scripts and navigation from the page text", () => {
    expect(f.text).not.toContain("ignore me");
    expect(f.text).not.toContain("Menu");
    expect(f.headings).toEqual(["Coffee worth waking up for", "Subscriptions", "Wholesale for cafes"]);
  });
});

describe("autopilot helpers", () => {
  it("infers the campaign objective from the goal", () => {
    expect(inferObjective("Get 200 demo sign-ups")).toBe("LEADS");
    expect(inferObjective("Drive online orders with our Diwali discount")).toBe("SALES");
    expect(inferObjective("Grow our community engagement")).toBe("ENGAGEMENT");
    expect(inferObjective("Make people know us in Chennai")).toBe("AWARENESS");
  });

  it("names the campaign from the goal", () => {
    expect(campaignName("launch the spring menu.")).toBe("Launch the spring menu");
    expect(campaignName("x ".repeat(100)).length).toBeLessThanOrEqual(80);
  });

  it("splits posts on === separators and falls back to platform sections", () => {
    expect(splitPosts("Post one is here and long enough\n===\nPost two is here and long enough", "LINKEDIN", 5)).toHaveLength(2);
    const sections = "**LinkedIn**\n\nLinkedIn text body goes here.\n\n**Instagram**\n\nInsta text goes here.";
    expect(splitPosts(sections, "INSTAGRAM", 3)).toEqual(["Insta text goes here."]);
  });

  it("parses subject lines and body from an AI email", () => {
    const r = parseEmail("**Subject line options**\n1. Big news for you\n2. Other\n\n---\n\nHi {{first_name}},\n\nBody.", "Fallback");
    expect(r.subject).toBe("Big news for you");
    expect(r.body).toBe("Hi {{first_name}},\n\nBody.");
    expect(parseEmail("Subject: Hello there\n\nBody", "F").subject).toBe("Hello there");
    expect(parseEmail("Just a body", "Fallback").subject).toBe("Fallback");
  });
});
