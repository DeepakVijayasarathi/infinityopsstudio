import { describe, expect, it } from "vitest";
import { analyzeHtml, suggestInternalLinks } from "@/server/services/seo-audit";

const meta = { status: 200, responseMs: 320, https: true, bytes: 18_000 };

const good = `<!doctype html><html lang="en"><head>
<title>Route optimization software for 3PLs | Northwind</title>
<meta name="description" content="Plan faster routes, cut fuel spend and hit every delivery window with route optimization built for third-party logistics teams.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="canonical" href="https://example.com/route-optimization">
<meta property="og:title" content="Route optimization"><meta property="og:image" content="https://example.com/og.png">
<script type="application/ld+json">{"@type":"Product"}</script>
</head><body><h1>Route optimization for 3PLs</h1><h2>Why it matters</h2>
<p>${"Dispatchers spend hours planning routes by hand. ".repeat(40)}</p>
<img src="a.png" alt="Route map"><a href="/pricing">Pricing</a><a href="/blog">Blog</a><a href="https://other.com">Other</a>
</body></html>`;

describe("analyzeHtml", () => {
  it("scores a well-structured page highly", () => {
    const r = analyzeHtml(good, "https://example.com/route-optimization", meta);
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.checks.find((c) => c.id === "title")?.status).toBe("pass");
  });

  it("flags missing title, description and h1", () => {
    const r = analyzeHtml("<html><body><p>hi</p><img src=x.png></body></html>", "http://example.com/", { ...meta, https: false });
    expect(r.score).toBeLessThan(50);
    const failing = r.checks.filter((c) => c.status !== "pass").map((c) => c.id);
    expect(failing).toEqual(expect.arrayContaining(["title", "h1"]));
  });

  it("keeps the score within 0–100", () => {
    const r = analyzeHtml("", "https://example.com", meta);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

describe("suggestInternalLinks", () => {
  it("ranks candidates by keyword overlap and excludes the source", () => {
    const source = { id: "s", title: "Fuel savings guide", keywords: ["fuel"], body: "Route optimization reduces fuel spend and idle time." };
    const out = suggestInternalLinks(source, [
      source,
      { id: "a", title: "Route optimization 101", keywords: ["route optimization"] },
      { id: "b", title: "Hiring drivers", keywords: ["recruiting"] },
    ]);
    expect(out.map((o) => o.id)).not.toContain("s");
    expect(out[0]?.id).toBe("a");
  });
});
