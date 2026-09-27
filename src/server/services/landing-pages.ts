import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { badRequest, notFound } from "../errors";
import { audit } from "../audit";
import { logger } from "../logger";
import { randomToken } from "../crypto";
import { generateText } from "../ai/service";
import { resolveModel } from "../ai/registry";
import type { WorkspaceContext } from "../tenant";
import { slugify } from "./workspaces";
import { getOrCreateWidget } from "./website";

/**
 * AI landing pages: structured sections (not free HTML) so pages always render safely and
 * consistently, stay editable field by field, and capture leads through the website widget.
 */

const text = (max: number) => z.string().trim().max(max);

export const pageContentSchema = z.object({
  hero: z.object({ eyebrow: text(80).default(""), headline: text(140).min(1), subheadline: text(400).default(""), cta: text(40).default("Get started") }),
  benefits: z.array(z.object({ title: text(80).min(1), body: text(300).default("") })).max(6).default([]),
  steps: z.array(z.object({ title: text(80).min(1), body: text(300).default("") })).max(5).default([]),
  proof: z.object({ quote: text(400).default(""), author: text(100).default(""), stat: text(40).default(""), statLabel: text(80).default("") }).default({}),
  faq: z.array(z.object({ q: text(200).min(1), a: text(600).default("") })).max(8).default([]),
  form: z
    .object({
      title: text(100).default("Get in touch"),
      button: text(40).default("Send"),
      success: text(200).default("Thanks! We'll be in touch shortly."),
      fields: z.array(z.enum(["name", "email", "company", "phone", "message"])).default(["name", "email", "company"]),
    })
    .default({}),
  closing: z.object({ headline: text(140).default(""), body: text(300).default("") }).default({}),
});

export type PageContent = z.infer<typeof pageContentSchema>;

export type GenerateInput = { offer: string; audience?: string | null; goal?: string | null; campaignId?: string | null };

// ─── Content generation ───

function templateContent(kit: { companyName: string; tagline: string | null; targetAudience: string | null; usps: string[]; productsServices: string | null } | null, fallbackName: string, input: GenerateInput): PageContent {
  const company = kit?.companyName ?? fallbackName;
  const rawAudience = (input.audience?.trim() || kit?.targetAudience || "teams like yours").replace(/[.\s]+$/, "");
  // Mid-sentence: "Operations leaders" → "operations leaders", but keep acronyms like "B2B".
  const audience = /^[A-Z][a-z]/.test(rawAudience) ? rawAudience[0]!.toLowerCase() + rawAudience.slice(1) : rawAudience;
  // Short form for mid-sentence use: "operations leaders at mid-size 3PLs (50–1,000…) who…" → "operations leaders at mid-size 3PLs".
  const who = audience.split(/\s+(?:who|that|which)\s|\s*[(,;—–]/)[0]!.trim().slice(0, 80) || audience;
  const offer = input.offer.trim();
  const usps = kit?.usps.filter(Boolean) ?? [];
  const benefits = [
    ...usps.slice(0, 3).map((u, i) => ({ title: u.length > 60 ? `${u.slice(0, 57)}…` : u, body: [`One of the main reasons ${who} choose ${company}.`, "No extra work on your side — our team sets it up with you.", "Proven with teams like yours, and simple to measure."][i]! })),
    { title: "Results you can measure", body: `See exactly what ${offer.toLowerCase()} delivers, with clear reporting from day one.` },
    { title: "Fast to get started", body: "Set up in days, not months. Our team guides you through every step." },
    { title: "Support from real people", body: "Questions answered quickly by specialists who know your goals." },
  ].slice(0, 3);
  const cta = /demo/i.test(`${offer} ${input.goal ?? ""}`) ? "Book a demo" : /trial|free/i.test(`${offer} ${input.goal ?? ""}`) ? "Start free" : "Get started";
  return pageContentSchema.parse({
    hero: { eyebrow: company, headline: offer.length <= 90 ? offer : `${offer.slice(0, 87)}…`, subheadline: `${kit?.tagline ? `${kit.tagline.replace(/[.\s]+$/, "")}. ` : ""}Built for ${audience}. Tell us what you need and we'll show you how ${company} can help.`, cta },
    benefits,
    steps: [
      { title: "Tell us about your goals", body: "Share a few details in the form below — it takes under a minute." },
      { title: "Get a tailored plan", body: `We'll show you how ${company} fits your team and what results to expect.` },
      { title: "See results", body: "Launch quickly and track progress in one place." },
    ],
    proof: { quote: "", author: "", stat: "", statLabel: "" },
    faq: [
      { q: `Who is ${company} for?`, a: `${company} is built for ${audience}.` },
      { q: "How quickly can we start?", a: "Most customers are up and running within a week." },
      { q: "What happens after I submit the form?", a: "A member of our team replies within one business day — no spam, ever." },
    ],
    form: { title: cta === "Book a demo" ? "Book your demo" : "Get in touch", button: cta, success: "Thanks! We'll be in touch within one business day.", fields: ["name", "email", "company", "message"] },
    closing: { headline: `Ready to see ${company} in action?`, body: `Join the ${who} who use ${company} to get more done.` },
  });
}

const GENERATE_PROMPT = `You write high-converting landing pages. Reply with ONLY a JSON object, no prose, in exactly this shape:
{"hero":{"eyebrow":"","headline":"","subheadline":"","cta":""},
 "benefits":[{"title":"","body":""}],            // 3 items
 "steps":[{"title":"","body":""}],               // 3 items: how it works
 "proof":{"quote":"","author":"","stat":"","statLabel":""},  // leave empty strings unless the brand context gives real proof; never invent customers or numbers
 "faq":[{"q":"","a":""}],                        // 3-5 items
 "form":{"title":"","button":"","success":"","fields":["name","email","company","message"]},
 "closing":{"headline":"","body":""}}
Headline ≤ 10 words, specific and benefit-led. Plain text only (no markdown, no HTML).`;

export async function generateContent(ctx: WorkspaceContext, input: GenerateInput): Promise<PageContent> {
  const kit = await db.brandKit.findUnique({ where: { workspaceId: ctx.workspace.id } });
  const model = await resolveModel(null);
  if (model.provider !== "local") {
    try {
      const r = await generateText({
        workspaceId: ctx.workspace.id,
        userId: ctx.user.id,
        feature: "landing:generate",
        system: GENERATE_PROMPT,
        maxTokens: 2500,
        messages: [{ role: "user", content: `Offer: ${input.offer}\nAudience: ${input.audience || "(use brand context)"}\nGoal of the page: ${input.goal || "capture qualified leads"}` }],
      });
      const json = r.text.match(/\{[\s\S]*\}/)?.[0];
      if (json) {
        const parsed = pageContentSchema.safeParse(JSON.parse(json));
        if (parsed.success) return parsed.data;
      }
      logger.warn("Landing page AI output did not match the schema; using the template");
    } catch (err) {
      logger.warn("Landing page generation failed; using the template", { err });
    }
  }
  return templateContent(kit, ctx.workspace.name, input);
}

// ─── CRUD ───

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = slugify(base).slice(0, 48) || "page";
  for (let i = 0; i < 5; i++) {
    const slug = i === 0 ? root : `${root.slice(0, 40)}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5)}`;
    const taken = await db.landingPage.findFirst({ where: { slug, ...(excludeId ? { NOT: { id: excludeId } } : {}) }, select: { id: true } });
    if (!taken) return slug;
  }
  return `${root.slice(0, 30)}-${Date.now().toString(36)}`;
}

export async function listPages(workspaceId: string) {
  return db.landingPage.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, slug: true, status: true, views: true, conversions: true, publishedAt: true, updatedAt: true, campaign: { select: { id: true, name: true } } },
  });
}

export async function getPage(workspaceId: string, id: string) {
  const page = await db.landingPage.findFirst({ where: { id, workspaceId }, include: { campaign: { select: { id: true, name: true } } } });
  if (!page) throw notFound("Landing page");
  return { ...page, content: pageContentSchema.parse(page.content) };
}

export async function createPage(ctx: WorkspaceContext, input: GenerateInput) {
  if (input.campaignId && !(await db.campaign.findFirst({ where: { id: input.campaignId, workspaceId: ctx.workspace.id }, select: { id: true } }))) throw notFound("Campaign");
  const content = await generateContent(ctx, input);
  const kit = await db.brandKit.findUnique({ where: { workspaceId: ctx.workspace.id }, select: { primaryColor: true, companyName: true } });
  const title = content.hero.headline.slice(0, 120);
  const page = await db.landingPage.create({
    data: {
      workspaceId: ctx.workspace.id,
      campaignId: input.campaignId ?? null,
      slug: await uniqueSlug(`${kit?.companyName ?? ctx.workspace.name} ${input.offer}`.slice(0, 60)),
      title,
      offer: input.offer.slice(0, 500),
      content: content as Prisma.InputJsonValue,
      accentColor: /^#[0-9a-f]{6}$/i.test(kit?.primaryColor ?? "") ? kit!.primaryColor : "#1f5cf5",
      seoTitle: `${title} | ${kit?.companyName ?? ctx.workspace.name}`.slice(0, 70),
      seoDescription: content.hero.subheadline.slice(0, 160) || null,
    },
  });
  await audit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: "landing_page.created", entityType: "LandingPage", entityId: page.id });
  return page;
}

export type PageUpdate = Partial<{ title: string; slug: string; content: PageContent; accentColor: string; seoTitle: string | null; seoDescription: string | null; campaignId: string | null }>;

export async function updatePage(ctx: WorkspaceContext, id: string, input: PageUpdate) {
  await getPage(ctx.workspace.id, id);
  const data: Prisma.LandingPageUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.content) data.content = pageContentSchema.parse(input.content) as Prisma.InputJsonValue;
  if (input.accentColor) data.accentColor = input.accentColor;
  if (input.seoTitle !== undefined) data.seoTitle = input.seoTitle;
  if (input.seoDescription !== undefined) data.seoDescription = input.seoDescription;
  if (input.slug !== undefined) {
    const slug = slugify(input.slug).slice(0, 60);
    if (!slug) throw badRequest("Enter a URL slug");
    if (await db.landingPage.findFirst({ where: { slug, NOT: { id } }, select: { id: true } })) throw badRequest("That URL is already taken — try another");
    data.slug = slug;
  }
  if (input.campaignId !== undefined) {
    if (input.campaignId && !(await db.campaign.findFirst({ where: { id: input.campaignId, workspaceId: ctx.workspace.id }, select: { id: true } }))) throw notFound("Campaign");
    data.campaign = input.campaignId ? { connect: { id: input.campaignId } } : { disconnect: true };
  }
  const page = await db.landingPage.update({ where: { id }, data });
  await audit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: "landing_page.updated", entityType: "LandingPage", entityId: id });
  return page;
}

/** Rewrites one section with AI, keeping the rest. */
export async function regenerateSection(ctx: WorkspaceContext, id: string, section: keyof PageContent) {
  const page = await getPage(ctx.workspace.id, id);
  const fresh = await generateContent(ctx, { offer: page.offer ?? page.title });
  const content = { ...page.content, [section]: fresh[section] };
  return updatePage(ctx, id, { content });
}

export async function setPublished(ctx: WorkspaceContext, id: string, publish: boolean) {
  const page = await getPage(ctx.workspace.id, id);
  if (publish) await getOrCreateWidget(ctx.workspace.id);
  const updated = await db.landingPage.update({ where: { id }, data: { status: publish ? "PUBLISHED" : "DRAFT", publishedAt: publish ? (page.publishedAt ?? new Date()) : page.publishedAt } });
  await audit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: publish ? "landing_page.published" : "landing_page.unpublished", entityType: "LandingPage", entityId: id });
  return updated;
}

export async function deletePage(ctx: WorkspaceContext, id: string) {
  await getPage(ctx.workspace.id, id);
  await db.landingPage.delete({ where: { id } });
  await audit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: "landing_page.deleted", entityType: "LandingPage", entityId: id });
  return { ok: true };
}

/** What the public /p/[slug] route renders. Drafts are visible only with `preview` from a signed-in member. */
export async function publicPage(slug: string, previewWorkspaceIds: string[] = []) {
  const page = await db.landingPage.findUnique({
    where: { slug },
    include: { workspace: { select: { id: true, name: true, deletedAt: true, brandKit: { select: { companyName: true, logoUrl: true } }, websiteWidget: { select: { publicKey: true, enabled: true } } } } },
  });
  if (!page || page.workspace.deletedAt) return null;
  if (page.status !== "PUBLISHED" && !previewWorkspaceIds.includes(page.workspaceId)) return null;
  return {
    id: page.id,
    status: page.status,
    title: page.title,
    seoTitle: page.seoTitle,
    seoDescription: page.seoDescription,
    accentColor: page.accentColor,
    content: pageContentSchema.parse(page.content),
    company: page.workspace.brandKit?.companyName ?? page.workspace.name,
    logoUrl: page.workspace.brandKit?.logoUrl ?? null,
    widgetKey: page.workspace.websiteWidget?.enabled ? page.workspace.websiteWidget.publicKey : null,
  };
}
