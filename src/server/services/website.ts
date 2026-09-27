import { createHash } from "node:crypto";
import type { WebsiteWidget } from "@prisma/client";
import { db } from "../db";
import { env } from "../env";
import { badRequest, forbidden, notFound } from "../errors";
import { audit } from "../audit";
import { logger } from "../logger";
import { randomToken } from "../crypto";
import { generateText } from "../ai/service";
import type { WorkspaceContext } from "../tenant";
import { createLead, logActivity } from "./leads";
import { notify } from "./notifications";

/**
 * Website integration: one public key per workspace powers the tracking script, the AI chat
 * widget and lead forms on the customer's own site (and hosted landing pages).
 * Tracking uses no cookies — visitors are counted with a hash that rotates daily.
 */

const DAY = 86_400_000;
const startOfUtcDay = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;

export async function getOrCreateWidget(workspaceId: string): Promise<WebsiteWidget> {
  const existing = await db.websiteWidget.findUnique({ where: { workspaceId } });
  if (existing) return existing;
  const kit = await db.brandKit.findUnique({ where: { workspaceId }, select: { primaryColor: true } });
  return db.websiteWidget.create({
    data: { workspaceId, publicKey: `pk_${randomToken(12)}`, inboundEmailToken: randomToken(24), ...(kit?.primaryColor && /^#[0-9a-f]{6}$/i.test(kit.primaryColor) ? { accentColor: kit.primaryColor } : {}) },
  });
}

export type WidgetInput = Partial<{ enabled: boolean; chatEnabled: boolean; aiReplies: boolean; greeting: string; accentColor: string; position: "left" | "right"; askEmailAfter: number; allowedDomains: string[] }>;

export async function updateWidget(ctx: WorkspaceContext, input: WidgetInput) {
  await getOrCreateWidget(ctx.workspace.id);
  const allowedDomains = input.allowedDomains?.map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")).filter(Boolean);
  const w = await db.websiteWidget.update({ where: { workspaceId: ctx.workspace.id }, data: { ...input, ...(allowedDomains ? { allowedDomains } : {}) } });
  await audit({ action: "website.widget_updated", workspaceId: ctx.workspace.id, actorId: ctx.user.id });
  return w;
}

/** Resolves a public key to its widget; throws 404 for unknown or disabled keys. */
export async function widgetByKey(key: string) {
  const w = await db.websiteWidget.findUnique({ where: { publicKey: key }, include: { workspace: { select: { id: true, name: true, deletedAt: true, subscription: { select: { plan: true } }, brandKit: { select: { companyName: true, logoUrl: true } } } } } });
  if (!w || !w.enabled || w.workspace.deletedAt) throw notFound("Website key");
  return w;
}

/** Optional domain allow-list: requests from other sites are refused (the key is public by design). */
export function originAllowed(allowed: string[], origin: string | null): boolean {
  if (!allowed.length || !origin) return true;
  let host: string;
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }
  return allowed.some((d) => host === d || host.endsWith(`.${d}`));
}

function assertOrigin(w: { allowedDomains: string[] }, origin: string | null) {
  // Hosted landing pages (/p/…) live on the app's own origin.
  const own = origin !== null && origin === new URL(env().APP_URL).origin;
  if (!own && !originAllowed(w.allowedDomains, origin)) throw forbidden("This website is not allowed to use this key");
}

export function visitorHash(workspaceId: string, ip: string, userAgent: string, day = startOfUtcDay()): string {
  return createHash("sha256").update(`${day.toISOString().slice(0, 10)}|${workspaceId}|${ip}|${userAgent}|${env().AUTH_SECRET}`).digest("hex").slice(0, 32);
}

const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|yandex|baidu|ecosia)\./;
const SOCIAL: [RegExp, string][] = [
  [/(^|\.)(facebook|fb)\.(com|me)$|(^|\.)l\.facebook\.com$/, "Facebook"],
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)linkedin\.com$|(^|\.)lnkd\.in$/, "LinkedIn"],
  [/(^|\.)(twitter|x)\.com$|(^|\.)t\.co$/, "X"],
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, "YouTube"],
  [/(^|\.)whatsapp\.com$|(^|\.)wa\.me$/, "WhatsApp"],
];

/** Classifies where a visit came from: UTM source, search, social, other site or direct. */
export function trafficSource(referrer: string | null | undefined, utmSource: string | null | undefined, pageHost?: string): string {
  if (utmSource?.trim()) return utmSource.trim().toLowerCase().slice(0, 60);
  if (!referrer) return "direct";
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "direct";
  }
  if (pageHost && host === pageHost.replace(/^www\./, "")) return "direct";
  if (SEARCH.test(host)) return "search";
  const social = SOCIAL.find(([re]) => re.test(host));
  if (social) return social[1];
  return host.slice(0, 60);
}

type Meta = { ip: string; userAgent: string | null; origin: string | null };

export async function trackEvent(key: string, input: { type: "pageview" | "conversion"; url: string; referrer?: string | null; utmSource?: string | null; utmCampaign?: string | null; landingPageId?: string | null }, meta: Meta) {
  const w = await widgetByKey(key);
  assertOrigin(w, meta.origin);
  if (meta.userAgent && /bot|crawler|spider|preview|headless/i.test(meta.userAgent)) return { ok: true };
  let page: URL;
  try {
    page = new URL(input.url);
  } catch {
    throw badRequest("Invalid page URL");
  }
  await db.siteEvent.create({
    data: {
      workspaceId: w.workspaceId,
      type: input.type === "conversion" ? "CONVERSION" : "PAGEVIEW",
      day: startOfUtcDay(),
      path: `${page.pathname}`.slice(0, 300),
      referrer: input.referrer?.slice(0, 500) || null,
      source: trafficSource(input.referrer, input.utmSource ?? page.searchParams.get("utm_source"), page.hostname),
      campaign: (input.utmCampaign ?? page.searchParams.get("utm_campaign"))?.slice(0, 100) || null,
      visitorHash: visitorHash(w.workspaceId, meta.ip, meta.userAgent ?? ""),
      landingPageId: input.landingPageId ?? null,
    },
  });
  if (input.landingPageId && input.type === "pageview") await db.landingPage.updateMany({ where: { id: input.landingPageId, workspaceId: w.workspaceId, status: "PUBLISHED" }, data: { views: { increment: 1 } } });
  return { ok: true };
}

/** Website analytics for the Website page. */
export async function websiteStats(workspaceId: string, days = 30) {
  const from = new Date(startOfUtcDay().getTime() - (days - 1) * DAY);
  const where = { workspaceId, day: { gte: from } };
  const [byDay, pages, sources, conversions] = await Promise.all([
    db.$queryRaw<{ day: Date; visitors: bigint; pageviews: bigint }[]>`SELECT day, COUNT(DISTINCT "visitorHash") AS visitors, COUNT(*) FILTER (WHERE type = 'PAGEVIEW') AS pageviews FROM "SiteEvent" WHERE "workspaceId" = ${workspaceId} AND day >= ${from} GROUP BY day ORDER BY day`,
    db.siteEvent.groupBy({ by: ["path"], where: { ...where, type: "PAGEVIEW" }, _count: true, orderBy: { _count: { path: "desc" } }, take: 10 }),
    db.siteEvent.groupBy({ by: ["source"], where: { ...where, type: "PAGEVIEW" }, _count: true, orderBy: { _count: { source: "desc" } }, take: 10 }),
    db.siteEvent.count({ where: { ...where, type: "CONVERSION" } }),
  ]);
  const map = new Map(byDay.map((r) => [r.day.toISOString().slice(0, 10), r]));
  const series = Array.from({ length: days }, (_, i) => {
    const key = new Date(from.getTime() + i * DAY).toISOString().slice(0, 10);
    const r = map.get(key);
    return { date: key, visitors: Number(r?.visitors ?? 0), pageviews: Number(r?.pageviews ?? 0) };
  });
  const pageviews = series.reduce((a, s) => a + s.pageviews, 0);
  return {
    visitors: series.reduce((a, s) => a + s.visitors, 0),
    pageviews,
    conversions,
    conversionRate: pageviews ? conversions / pageviews : 0,
    series,
    topPages: pages.map((p) => ({ path: p.path, views: p._count })),
    sources: sources.map((s) => ({ source: s.source ?? "direct", views: s._count })),
  };
}

/** Daily unique visitors and conversion events, for the analytics rollup. */
export async function websiteDay(workspaceId: string, day = startOfUtcDay()) {
  const [visitors, conversions] = await Promise.all([
    db.siteEvent.findMany({ where: { workspaceId, day }, distinct: ["visitorHash"], select: { visitorHash: true } }),
    db.siteEvent.count({ where: { workspaceId, day, type: "CONVERSION" } }),
  ]);
  return { visits: visitors.length, conversions };
}

// ─── Leads from the website ───

type LeadForm = { name?: string | null; email: string; phone?: string | null; company?: string | null; message?: string | null; page?: string | null; landingPageId?: string | null; utmSource?: string | null; utmCampaign?: string | null };

function splitName(name?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? "Website visitor", lastName: parts.slice(1).join(" ") || null };
}

/** Finds or creates the lead for an email and records how it arrived. */
async function upsertWebsiteLead(w: Awaited<ReturnType<typeof widgetByKey>>, f: LeadForm, via: string) {
  const email = f.email.toLowerCase().trim();
  const existing = await db.lead.findFirst({ where: { workspaceId: w.workspaceId, email, deletedAt: null } });
  if (existing) {
    await logActivity(w.workspaceId, existing.id, "NOTE", `${via}${f.message ? `: “${f.message.slice(0, 500)}”` : ""}`);
    return { lead: existing, created: false };
  }
  const { firstName, lastName } = splitName(f.name);
  const lead = await createLead(
    { workspace: { id: w.workspaceId }, user: null, plan: w.workspace.subscription?.plan ?? "FREE" },
    { firstName, lastName, email, phone: f.phone || null, company: f.company || null, source: "WEBSITE", tags: ["website", ...(f.utmSource ? [`utm:${f.utmSource.slice(0, 30)}`] : [])] },
    { activity: `${via}${f.page ? ` on ${f.page.slice(0, 200)}` : ""}` },
  );
  if (f.message) await logActivity(w.workspaceId, lead.id, "NOTE", `Message: “${f.message.slice(0, 1000)}”`);
  return { lead, created: true };
}

export async function captureLead(key: string, f: LeadForm, meta: Meta) {
  const w = await widgetByKey(key);
  assertOrigin(w, meta.origin);
  if (!EMAIL_RE.test(f.email)) throw badRequest("Enter a valid email address");
  const { lead, created } = await upsertWebsiteLead(w, f, f.landingPageId ? "Submitted the landing page form" : "Submitted a website form");
  let path = "/";
  try {
    path = f.page ? new URL(f.page).pathname : "/";
  } catch {
    /* keep default */
  }
  await db.siteEvent.create({ data: { workspaceId: w.workspaceId, type: "CONVERSION", day: startOfUtcDay(), path: path.slice(0, 300), source: trafficSource(null, f.utmSource), campaign: f.utmCampaign ?? null, visitorHash: visitorHash(w.workspaceId, meta.ip, meta.userAgent ?? ""), landingPageId: f.landingPageId ?? null } });
  if (f.landingPageId) await db.landingPage.updateMany({ where: { id: f.landingPageId, workspaceId: w.workspaceId }, data: { conversions: { increment: 1 } } });
  return { ok: true, created, leadId: lead.id };
}

// ─── Website chat ───

export async function widgetConfig(key: string, origin: string | null) {
  const w = await widgetByKey(key);
  assertOrigin(w, origin);
  return { chatEnabled: w.chatEnabled, greeting: w.greeting, accentColor: w.accentColor, position: w.position, companyName: w.workspace.brandKit?.companyName ?? w.workspace.name, logoUrl: w.workspace.brandKit?.logoUrl ?? null };
}

export type PublicMessage = { id: string; from: "visitor" | "assistant" | "team"; body: string; at: string };
const toPublic = (m: { id: string; direction: string; author: string; body: string; createdAt: Date }): PublicMessage => ({ id: m.id, from: m.direction === "IN" ? "visitor" : m.author === "AGENT" ? "team" : "assistant", body: m.body, at: m.createdAt.toISOString() });

export async function chatMessages(key: string, visitorId: string, origin: string | null, afterId?: string | null) {
  const w = await widgetByKey(key);
  assertOrigin(w, origin);
  const convo = await db.conversation.findUnique({ where: { workspaceId_channel_externalId: { workspaceId: w.workspaceId, channel: "WEBSITE", externalId: visitorId } } });
  if (!convo) return { messages: [] as PublicMessage[] };
  let after: Date | undefined;
  if (afterId) after = (await db.message.findFirst({ where: { id: afterId, conversationId: convo.id }, select: { createdAt: true } }))?.createdAt;
  const messages = await db.message.findMany({ where: { conversationId: convo.id, ...(after ? { createdAt: { gt: after } } : {}) }, orderBy: { createdAt: "asc" }, take: 100 });
  return { messages: messages.map(toPublic) };
}

/** System prompt for chat replies; the local demo provider recognises the [chat-assistant] marker. */
export function chatSystemPrompt(company: string, contact: { name?: string | null; email?: string | null }, channel: string) {
  return `[chat-assistant] You are the ${channel} assistant for ${company}. Reply like a helpful, friendly team member in 1-3 short sentences (under 80 words), in the visitor's language.
Only use facts from the brand context below; if you don't know something, say the team will follow up rather than guessing. Never make up prices, dates or promises.
When the visitor asks about pricing, demos, availability or anything needing a person, ask for their email (if not known) so the team can follow up.
Visitor name: ${contact.name ?? "unknown"}
Visitor email: ${contact.email ?? "unknown"}`;
}

export async function chat(key: string, input: { visitorId: string; message: string; name?: string | null; email?: string | null; page?: string | null }, meta: Meta) {
  const w = await widgetByKey(key);
  assertOrigin(w, meta.origin);
  if (!w.chatEnabled) throw forbidden("Chat is turned off");
  const ws = w.workspaceId;
  const typedEmail = input.message.match(EMAIL_RE)?.[0] ?? null;
  const email = (input.email || typedEmail)?.toLowerCase() ?? null;

  let convo = await db.conversation.findUnique({ where: { workspaceId_channel_externalId: { workspaceId: ws, channel: "WEBSITE", externalId: input.visitorId } } });
  const isNew = !convo;
  convo ??= await db.conversation.create({ data: { workspaceId: ws, channel: "WEBSITE", externalId: input.visitorId, contactName: input.name || null, contactHandle: email, subject: input.page ? `Chat on ${input.page.slice(0, 150)}` : "Website chat" } });

  const incoming = await db.message.create({ data: { conversationId: convo.id, workspaceId: ws, direction: "IN", author: "CONTACT", body: input.message.slice(0, 4000) } });
  await db.conversation.update({ where: { id: convo.id }, data: { lastMessageAt: new Date(), unread: { increment: 1 }, status: "OPEN", ...(input.name && !convo.contactName ? { contactName: input.name } : {}), ...(email && !convo.contactHandle ? { contactHandle: email } : {}) } });

  // An email address turns the chat into a lead.
  if (email && !convo.leadId) {
    try {
      const { lead } = await upsertWebsiteLead(w, { name: input.name ?? convo.contactName, email, page: input.page, message: input.message }, "Started a website chat");
      convo = await db.conversation.update({ where: { id: convo.id }, data: { leadId: lead.id, contactHandle: email } });
    } catch (err) {
      logger.warn("Could not create lead from chat", { err });
    }
  }
  if (isNew) await notify({ workspaceId: ws, type: "inbox.message", title: "New website chat", body: input.message.slice(0, 140), link: `/app/inbox?c=${convo.id}`, permission: "leads:read" });

  if (!w.aiReplies || !convo.aiEnabled) return { messages: [toPublic(incoming)] };

  const history = await db.message.findMany({ where: { conversationId: convo.id }, orderBy: { createdAt: "desc" }, take: 12 });
  let reply: string;
  try {
    const r = await generateText({
      workspaceId: ws,
      feature: "website:chat",
      maxTokens: 400,
      system: chatSystemPrompt(w.workspace.brandKit?.companyName ?? w.workspace.name, { name: convo.contactName, email: convo.contactHandle }, "website chat"),
      messages: history.reverse().map((m) => ({ role: m.direction === "IN" ? ("user" as const) : ("assistant" as const), content: m.body })),
    });
    reply = r.text.trim().slice(0, 2000) || "Thanks! Our team will get back to you shortly.";
  } catch (err) {
    logger.warn("Website chat AI reply failed", { err, workspaceId: ws });
    reply = `Thanks for your message! Someone from ${w.workspace.brandKit?.companyName ?? "our team"} will reply here soon.`;
  }
  const out = await db.message.create({ data: { conversationId: convo.id, workspaceId: ws, direction: "OUT", author: "AI", body: reply } });
  await db.conversation.update({ where: { id: convo.id }, data: { lastMessageAt: new Date() } });
  return { messages: [toPublic(incoming), toPublic(out)] };
}

