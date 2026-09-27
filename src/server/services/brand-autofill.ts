import { z } from "zod";
import { badRequest } from "../errors";
import { logger } from "../logger";
import { safeFetch } from "../net";
import { generateText } from "../ai/service";
import { resolveModel } from "../ai/registry";
import type { BrandKitInput } from "./brand";

/**
 * Drafts a Brand Kit from a public website: page metadata gives the basics deterministically,
 * and when a real AI model is configured it also infers voice, audience, USPs and competitors.
 * Nothing is saved — the user reviews the draft first.
 */

const MAX_BYTES = 1_500_000;

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();

function meta(html: string, name: string): string | undefined {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decode(content) : undefined;
}

function tagTexts(html: string, tag: string, limit: number): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < limit) {
    const t = decode(m[1]!.replace(/<[^>]+>/g, " "));
    if (t.length > 2 && t.length < 160 && !out.includes(t)) out.push(t);
  }
  return out;
}

const INDUSTRIES: [RegExp, string][] = [
  [/\b(saas|software|platform|app|cloud|api|developer)\b/i, "Software / SaaS"],
  [/\b(logistics|shipping|freight|fleet|delivery|warehouse)\b/i, "Logistics"],
  [/\b(clinic|health|medical|hospital|doctor|wellness|pharma)\b/i, "Healthcare"],
  [/\b(restaurant|food|cafe|coffee|bakery|catering)\b/i, "Food & beverage"],
  [/\b(real estate|property|apartments|homes|realty)\b/i, "Real estate"],
  [/\b(school|course|learn|education|academy|training|university)\b/i, "Education"],
  [/\b(fashion|clothing|apparel|jewell?ery|boutique)\b/i, "Fashion & retail"],
  [/\b(shop|store|ecommerce|e-commerce|buy online|cart)\b/i, "E-commerce"],
  [/\b(agency|marketing|advertising|branding|seo)\b/i, "Marketing & advertising"],
  [/\b(bank|finance|fintech|insurance|loan|invest|accounting)\b/i, "Financial services"],
  [/\b(travel|hotel|tour|resort|booking)\b/i, "Travel & hospitality"],
  [/\b(consult|consulting|advisory|services)\b/i, "Professional services"],
];

export type WebsiteFacts = {
  url: string;
  companyName: string;
  tagline: string | null;
  description: string | null;
  headings: string[];
  text: string;
  logoUrl: string | null;
  themeColor: string | null;
  industry: string | null;
};

/** Extracts brand facts from HTML (pure; exported for tests). */
export function extractFacts(html: string, pageUrl: URL): WebsiteFacts {
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const siteName = meta(html, "og:site_name") ?? meta(html, "application-name");
  const description = meta(html, "description") ?? meta(html, "og:description") ?? null;
  const companyName = (siteName ?? title.split(/\s[|–—\-·:]\s/)[0] ?? pageUrl.hostname.replace(/^www\./, "")).trim() || pageUrl.hostname;
  const h1 = tagTexts(html, "h1", 2);
  const headings = [...h1, ...tagTexts(html, "h2", 8)];
  const body = html
    .replace(/<(script|style|noscript|svg|nav|footer)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  const text = decode(body).slice(0, 4000);
  const abs = (href?: string | null) => {
    if (!href) return null;
    try {
      const u = new URL(href, pageUrl);
      return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
    } catch {
      return null;
    }
  };
  const icon = html.match(/<link[^>]+rel=["'](?:apple-touch-icon|icon|shortcut icon)["'][^>]*>/i)?.[0]?.match(/href=["']([^"']+)["']/i)?.[1];
  const themeColor = meta(html, "theme-color");
  const haystack = `${title} ${description ?? ""} ${headings.join(" ")} ${text.slice(0, 1500)}`;
  return {
    url: pageUrl.origin,
    companyName: companyName.slice(0, 120),
    tagline: (h1[0] && h1[0].length <= 120 ? h1[0] : description?.split(/(?<=[.!?])\s/)[0]) ?? null,
    description,
    headings,
    text,
    logoUrl: abs(meta(html, "og:image") ?? icon),
    themeColor: themeColor && /^#[0-9a-f]{6}$/i.test(themeColor) ? themeColor : null,
    industry: INDUSTRIES.find(([re]) => re.test(haystack))?.[1] ?? null,
  };
}

const aiSchema = z.object({
  tagline: z.string().max(160).optional(),
  industry: z.string().max(80).optional(),
  voice: z.string().max(300).optional(),
  voiceAttributes: z.array(z.string().max(30)).max(6).optional(),
  targetAudience: z.string().max(400).optional(),
  productsServices: z.string().max(800).optional(),
  usps: z.array(z.string().max(160)).max(6).optional(),
  competitors: z.array(z.string().max(80)).max(6).optional(),
});

export async function autofillBrandFromWebsite(workspaceId: string, rawUrl: string): Promise<{ draft: BrandKitInput; usedAI: boolean; source: string }> {
  const { res, url } = await safeFetch(rawUrl, { headers: { "user-agent": "InfinityOpsStudio-BrandBot/1.0", accept: "text/html" } });
  if (!res.ok) throw badRequest(`The website responded with HTTP ${res.status}`);
  if (!(res.headers.get("content-type") ?? "").includes("html")) throw badRequest("That URL isn't a web page");
  const buf = await res.arrayBuffer();
  const html = new TextDecoder().decode(buf.byteLength > MAX_BYTES ? buf.slice(0, MAX_BYTES) : buf);
  const f = extractFacts(html, url);

  const draft: BrandKitInput = {
    companyName: f.companyName,
    tagline: f.tagline,
    website: f.url,
    industry: f.industry,
    logoUrl: f.logoUrl,
    productsServices: [f.description, f.headings.slice(1, 6).join(" · ")].filter(Boolean).join("\n") || null,
    ...(f.themeColor ? { primaryColor: f.themeColor } : {}),
  };

  // Richer inference only with a real model; the offline demo provider can't read a website.
  let usedAI = false;
  const model = await resolveModel(null);
  if (model.provider !== "local") {
    try {
      const r = await generateText({
        workspaceId,
        feature: "brand:autofill",
        useBrandContext: false,
        maxTokens: 1500,
        messages: [
          {
            role: "user",
            content: `From this company's website content, infer its brand profile. Reply with ONLY a JSON object with keys: tagline, industry, voice (one sentence describing tone), voiceAttributes (3-5 adjectives), targetAudience, productsServices, usps (3-5 short bullet phrases), competitors (only if clearly implied, else []).\n\nCompany: ${f.companyName}\nURL: ${f.url}\nDescription: ${f.description ?? "n/a"}\nHeadings: ${f.headings.join(" | ")}\nPage text: ${f.text.slice(0, 3000)}`,
          },
        ],
      });
      const json = r.text.match(/\{[\s\S]*\}/)?.[0];
      const parsed = json ? aiSchema.safeParse(JSON.parse(json)) : null;
      if (parsed?.success) {
        const a = parsed.data;
        Object.assign(draft, {
          ...(a.tagline ? { tagline: a.tagline } : {}),
          ...(a.industry ? { industry: a.industry } : {}),
          ...(a.voice ? { voice: a.voice } : {}),
          ...(a.voiceAttributes?.length ? { voiceAttributes: a.voiceAttributes } : {}),
          ...(a.targetAudience ? { targetAudience: a.targetAudience } : {}),
          ...(a.productsServices ? { productsServices: a.productsServices } : {}),
          ...(a.usps?.length ? { usps: a.usps } : {}),
          ...(a.competitors?.length ? { competitors: a.competitors } : {}),
        });
        usedAI = true;
      }
    } catch (err) {
      logger.warn("Brand autofill AI step failed; using page metadata only", { err });
    }
  }
  return { draft, usedAI, source: f.url };
}
