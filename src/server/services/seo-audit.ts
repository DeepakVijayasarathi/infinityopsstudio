export type AuditCheck = { id: string; label: string; status: "pass" | "warn" | "fail"; detail: string; weight: number };
export type AuditResult = { url: string; score: number; checks: AuditCheck[]; stats: Record<string, number | string | null>; fetchedAt: string };

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? decode(m[2] ?? m[3] ?? m[4] ?? "") : null;
}

function metaContent(html: string, key: string, keyAttr = "name"): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (attr(tag, keyAttr)?.toLowerCase() === key) return attr(tag, "content");
  }
  return null;
}

/** Pure on-page SEO analyzer (unit-tested). */
export function analyzeHtml(html: string, url: string, meta: { status: number; responseMs: number; https: boolean; bytes: number }): AuditResult {
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const description = metaContent(html, "description");
  const viewport = metaContent(html, "viewport");
  const robots = metaContent(html, "robots");
  const ogTitle = metaContent(html, "og:title", "property");
  const ogImage = metaContent(html, "og:image", "property");
  const twitterCard = metaContent(html, "twitter:card");
  const canonical = (html.match(/<link\b[^>]*rel=["']?canonical["']?[^>]*>/i) ?? [])[0];
  const lang = html.match(/<html\b[^>]*\blang=["']?([a-zA-Z-]+)/i)?.[1] ?? null;
  const h1s = html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi) ?? [];
  const h2s = html.match(/<h2\b/gi) ?? [];
  const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
  const imgsNoAlt = imgs.filter((t) => !attr(t, "alt"));
  const links = html.match(/<a\b[^>]*href=[^>]*>/gi) ?? [];
  const host = new URL(url).hostname;
  const internal = links.filter((l) => {
    const href = attr(l, "href") ?? "";
    return href.startsWith("/") || href.includes(host);
  });
  const structured = /application\/ld\+json/i.test(html);
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const wordCount = text ? text.split(" ").length : 0;

  const checks: AuditCheck[] = [];
  const add = (id: string, label: string, status: AuditCheck["status"], detail: string, weight: number) => checks.push({ id, label, status, detail, weight });

  add("status", "Page responds successfully", meta.status < 400 ? "pass" : "fail", `HTTP ${meta.status}`, 10);
  add("https", "Served over HTTPS", meta.https ? "pass" : "fail", meta.https ? "Secure connection" : "Serve the site over HTTPS", 8);
  add("title", "Title tag", !title ? "fail" : title.length < 30 || title.length > 60 ? "warn" : "pass", title ? `“${title}” (${title.length} chars; aim for 30–60)` : "Missing <title>", 10);
  add("description", "Meta description", !description ? "fail" : description.length < 70 || description.length > 160 ? "warn" : "pass", description ? `${description.length} chars; aim for 70–160` : "Missing meta description", 8);
  add("h1", "Single H1 heading", h1s.length === 1 ? "pass" : h1s.length === 0 ? "fail" : "warn", `${h1s.length} H1 tag(s) found`, 8);
  add("h2", "Content structured with H2s", h2s.length >= 2 ? "pass" : "warn", `${h2s.length} H2 tag(s)`, 4);
  add("viewport", "Mobile viewport", viewport ? "pass" : "fail", viewport ? "Viewport meta present" : "Add <meta name=viewport>", 8);
  add("canonical", "Canonical URL", canonical ? "pass" : "warn", canonical ? (attr(canonical, "href") ?? "present") : "Add a canonical link to avoid duplicate content", 5);
  add("lang", "Language attribute", lang ? "pass" : "warn", lang ? `lang="${lang}"` : "Add lang to <html>", 3);
  add("robots", "Indexable", robots && /noindex/i.test(robots) ? "fail" : "pass", robots ? `robots: ${robots}` : "No robots restrictions", 10);
  add("alt", "Image alt text", imgs.length === 0 || imgsNoAlt.length === 0 ? "pass" : imgsNoAlt.length / imgs.length > 0.3 ? "fail" : "warn", `${imgsNoAlt.length} of ${imgs.length} images missing alt text`, 6);
  add("og", "Open Graph tags", ogTitle && ogImage ? "pass" : ogTitle || ogImage ? "warn" : "fail", ogTitle && ogImage ? "og:title and og:image present" : "Add og:title and og:image for rich link previews", 4);
  add("twitter", "Twitter card", twitterCard ? "pass" : "warn", twitterCard ? `twitter:card=${twitterCard}` : "Add twitter:card metadata", 2);
  add("schema", "Structured data", structured ? "pass" : "warn", structured ? "JSON-LD found" : "Add JSON-LD structured data", 4);
  add("content", "Content depth", wordCount >= 300 ? "pass" : wordCount >= 150 ? "warn" : "fail", `${wordCount} words on page`, 6);
  add("links", "Internal links", internal.length >= 5 ? "pass" : "warn", `${internal.length} internal links`, 4);
  add("speed", "Server response time", meta.responseMs < 800 ? "pass" : meta.responseMs < 2000 ? "warn" : "fail", `${meta.responseMs} ms`, 6);
  add("size", "Page weight", meta.bytes < 500_000 ? "pass" : meta.bytes < 1_500_000 ? "warn" : "fail", `${Math.round(meta.bytes / 1024)} KB HTML`, 4);

  const total = checks.reduce((a, c) => a + c.weight, 0);
  const earned = checks.reduce((a, c) => a + (c.status === "pass" ? c.weight : c.status === "warn" ? c.weight / 2 : 0), 0);
  return {
    url,
    score: Math.round((earned / total) * 100),
    checks,
    stats: { title, description, wordCount, h1: h1s.length, images: imgs.length, internalLinks: internal.length, externalLinks: links.length - internal.length, responseMs: meta.responseMs },
    fetchedAt: new Date().toISOString(),
  };
}

/** Deterministic internal-link suggestions based on title/keyword overlap. */
export function suggestInternalLinks<T extends { id: string; title: string; keywords: string[] }>(source: T & { body: string }, candidates: T[], limit = 5) {
  const stop = new Set(["the", "and", "for", "with", "your", "how", "what", "why", "you", "are", "our", "this", "that", "from", "into", "guide"]);
  const tokens = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]{3,}/g)?.filter((w) => !stop.has(w)) ?? []);
  const bodyTokens = tokens(`${source.title} ${source.body} ${source.keywords.join(" ")}`);
  return candidates
    .filter((c) => c.id !== source.id)
    .map((c) => {
      const t = tokens(`${c.title} ${c.keywords.join(" ")}`);
      const overlap = [...t].filter((w) => bodyTokens.has(w));
      return { id: c.id, title: c.title, score: t.size ? overlap.length / t.size : 0, anchors: overlap.slice(0, 3) };
    })
    .filter((c) => c.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
