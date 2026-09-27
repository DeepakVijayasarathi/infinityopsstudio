import type { EmailCampaignStatus, EmailCampaignType, LeadSource, LeadStatus, Prisma } from "@prisma/client";
import { db } from "../db";
import { env } from "../env";
import { badRequest, forbidden, notFound } from "../errors";
import { audit } from "../audit";
import { hmac, randomToken, safeEqual } from "../crypto";
import { enqueue } from "../queue";
import { emailProvider, smtpFromCredentials, type EmailProvider } from "../email";
import { layout, escapeHtml } from "../email/templates";
import { streamText } from "../ai/service";
import type { WorkspaceContext } from "../tenant";
import { can } from "../tenant";
import { assertUsageAvailable, recordUsage } from "../billing/usage";
import { integrationCredentials } from "./integrations";
import { renderMarkdown } from "./content";
import { logActivity } from "./leads";
import { logger } from "../logger";

export type Segment = { statuses?: LeadStatus[]; sources?: LeadSource[]; tags?: string[]; minScore?: number; campaignId?: string };
export type SequenceStep = { delayDays: number; subject: string; body: string };

// ─── Templates ───

export async function listTemplates(workspaceId: string) {
  return db.emailTemplate.findMany({ where: { workspaceId }, orderBy: { updatedAt: "desc" } });
}

export async function upsertTemplate(ctx: WorkspaceContext, id: string | null, input: { name: string; category?: string; subject: string; previewText?: string | null; body: string }) {
  if (id) {
    const t = await db.emailTemplate.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
    if (!t) throw notFound("Template");
    return db.emailTemplate.update({ where: { id }, data: input });
  }
  return db.emailTemplate.create({ data: { ...input, workspaceId: ctx.workspace.id } });
}

export async function deleteTemplate(ctx: WorkspaceContext, id: string) {
  const t = await db.emailTemplate.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!t) throw notFound("Template");
  await db.emailTemplate.delete({ where: { id } });
}

// ─── Segments ───

export function segmentWhere(workspaceId: string, s: Segment | null | undefined): Prisma.LeadWhereInput {
  return {
    workspaceId,
    deletedAt: null,
    unsubscribedAt: null,
    email: { not: null },
    ...(s?.statuses?.length ? { status: { in: s.statuses } } : {}),
    ...(s?.sources?.length ? { source: { in: s.sources } } : {}),
    ...(s?.tags?.length ? { tags: { hasSome: s.tags } } : {}),
    ...(s?.minScore ? { score: { gte: s.minScore } } : {}),
    ...(s?.campaignId ? { campaignId: s.campaignId } : {}),
  };
}

export async function previewSegment(workspaceId: string, segment: Segment) {
  const where = segmentWhere(workspaceId, segment);
  const [count, sample] = await Promise.all([
    db.lead.count({ where }),
    db.lead.findMany({ where, take: 5, select: { id: true, firstName: true, lastName: true, email: true, company: true } }),
  ]);
  return { count, sample };
}

// ─── Campaigns ───

export type EmailCampaignInput = {
  name: string;
  type?: EmailCampaignType;
  subject: string;
  previewText?: string | null;
  body: string;
  fromName?: string | null;
  segment?: Segment | null;
  steps?: SequenceStep[] | null;
  templateId?: string | null;
  campaignId?: string | null;
};

export async function listEmailCampaigns(workspaceId: string, status?: EmailCampaignStatus) {
  return db.emailCampaign.findMany({
    where: { workspaceId, ...(status ? { status } : {}) },
    orderBy: { updatedAt: "desc" },
    include: { campaign: { select: { id: true, name: true } } },
  });
}

export async function getEmailCampaign(workspaceId: string, id: string) {
  const c = await db.emailCampaign.findFirst({ where: { id, workspaceId }, include: { campaign: { select: { id: true, name: true } }, template: { select: { id: true, name: true } } } });
  if (!c) throw notFound("Email campaign");
  return c;
}

function validateSteps(type: EmailCampaignType | undefined, steps: SequenceStep[] | null | undefined) {
  if (type === "SEQUENCE") {
    if (!steps?.length) throw badRequest("A sequence needs at least one follow-up step");
    if (steps.length > 10) throw badRequest("Sequences can have up to 10 follow-up steps");
  }
}

export async function createEmailCampaign(ctx: WorkspaceContext, input: EmailCampaignInput) {
  validateSteps(input.type, input.steps);
  const { segment, steps, ...rest } = input;
  const c = await db.emailCampaign.create({
    data: {
      ...rest,
      workspaceId: ctx.workspace.id,
      segment: (segment ?? undefined) as Prisma.InputJsonValue | undefined,
      steps: (steps ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
  await audit({ action: "email.campaign_created", workspaceId: ctx.workspace.id, actorId: ctx.user.id, entityType: "EmailCampaign", entityId: c.id });
  return c;
}

export async function updateEmailCampaign(ctx: WorkspaceContext, id: string, input: Partial<EmailCampaignInput>) {
  const c = await getEmailCampaign(ctx.workspace.id, id);
  if (!["DRAFT", "SCHEDULED", "PAUSED"].includes(c.status)) throw badRequest("Only draft, scheduled or paused campaigns can be edited");
  validateSteps(input.type ?? c.type, input.steps ?? (c.steps as SequenceStep[] | null));
  const { segment, steps, ...rest } = input;
  return db.emailCampaign.update({
    where: { id },
    data: {
      ...rest,
      ...(segment !== undefined ? { segment: (segment ?? undefined) as Prisma.InputJsonValue | undefined } : {}),
      ...(steps !== undefined ? { steps: (steps ?? undefined) as Prisma.InputJsonValue | undefined } : {}),
    },
  });
}

export async function deleteEmailCampaign(ctx: WorkspaceContext, id: string) {
  const c = await getEmailCampaign(ctx.workspace.id, id);
  if (c.status === "SENDING") throw badRequest("A campaign that is sending cannot be deleted");
  await db.emailCampaign.delete({ where: { id } });
}

function assertSendable(ctx: WorkspaceContext) {
  if (!can(ctx, "email:send")) throw forbidden("Only managers can send or schedule email campaigns");
}

export async function scheduleEmailCampaign(ctx: WorkspaceContext, id: string, scheduledAt: Date | null) {
  assertSendable(ctx);
  const c = await getEmailCampaign(ctx.workspace.id, id);
  if (!["DRAFT", "SCHEDULED", "PAUSED"].includes(c.status)) throw badRequest("This campaign cannot be scheduled");
  const audience = await previewSegment(ctx.workspace.id, (c.segment ?? {}) as Segment);
  if (!audience.count) throw badRequest("The selected segment has no subscribed leads with an email address");
  await assertUsageAvailable(ctx.workspace.id, "EMAILS_SENT", audience.count);

  if (!scheduledAt || scheduledAt <= new Date()) {
    await db.emailCampaign.update({ where: { id }, data: { status: c.type === "SEQUENCE" ? "ACTIVE" : "SENDING", scheduledAt: null } });
    await enqueue("email", { kind: "send-campaign", emailCampaignId: id });
  } else {
    await db.emailCampaign.update({ where: { id }, data: { status: "SCHEDULED", scheduledAt } });
  }
  await audit({ action: "email.campaign_scheduled", workspaceId: ctx.workspace.id, actorId: ctx.user.id, entityType: "EmailCampaign", entityId: id, metadata: { scheduledAt, recipients: audience.count } });
  return { recipients: audience.count };
}

export async function setSequenceState(ctx: WorkspaceContext, id: string, state: "PAUSED" | "ACTIVE" | "CANCELLED") {
  assertSendable(ctx);
  const c = await getEmailCampaign(ctx.workspace.id, id);
  if (state === "CANCELLED" && !["SCHEDULED", "ACTIVE", "PAUSED"].includes(c.status)) throw badRequest("Nothing to cancel");
  if (state === "PAUSED" && c.status !== "ACTIVE") throw badRequest("Only active sequences can be paused");
  if (state === "ACTIVE" && c.status !== "PAUSED") throw badRequest("Only paused sequences can be resumed");
  return db.emailCampaign.update({ where: { id }, data: { status: state } });
}

// ─── Rendering & tracking ───

export function clickSignature(token: string, url: string) {
  return hmac(`${token}|${url}`).slice(0, 32);
}

export function verifyClick(token: string, url: string, sig: string) {
  return safeEqual(clickSignature(token, url), sig);
}

export function applyMergeTags(text: string, lead: { firstName?: string | null; lastName?: string | null; company?: string | null; email?: string | null }) {
  return text
    .replace(/\{\{\s*first_name\s*\}\}/g, lead.firstName || "there")
    .replace(/\{\{\s*last_name\s*\}\}/g, lead.lastName || "")
    .replace(/\{\{\s*company\s*\}\}/g, lead.company || "your team")
    .replace(/\{\{\s*email\s*\}\}/g, lead.email || "");
}

export function renderCampaignEmail(opts: { subject: string; body: string; previewText?: string | null; token: string; lead: { firstName?: string | null; lastName?: string | null; company?: string | null; email?: string | null }; workspaceName: string }) {
  const base = env().APP_URL;
  const merged = applyMergeTags(opts.body, opts.lead).replace(/\{\{\s*cta_url\s*\}\}/g, base);
  let html = renderMarkdown(merged);
  html = html.replace(/href="(https?:\/\/[^"]+)"/g, (_m, url: string) => {
    const decoded = url.replace(/&amp;/g, "&");
    return `href="${base}/api/v1/email/track/click/${opts.token}?u=${encodeURIComponent(decoded)}&s=${clickSignature(opts.token, decoded)}"`;
  });
  const unsubscribe = `${base}/unsubscribe/${opts.token}`;
  const preheader = opts.previewText ? `<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(opts.previewText)}</div>` : "";
  const footer = `${escapeHtml(opts.workspaceName)} · <a href="${unsubscribe}" style="color:#64748b">Unsubscribe</a>`;
  const full = layout(applyMergeTags(opts.subject, opts.lead), `${preheader}${html}<img src="${base}/api/v1/email/track/open/${opts.token}" width="1" height="1" alt="" style="display:block">`, footer);
  const text = `${merged.replace(/[#*_`>]/g, "")}\n\n—\nUnsubscribe: ${unsubscribe}`;
  return { html: full, text, subject: applyMergeTags(opts.subject, opts.lead), unsubscribe };
}

async function providerFor(workspaceId: string): Promise<EmailProvider> {
  const smtp = await integrationCredentials(workspaceId, "smtp");
  return smtp ? smtpFromCredentials(smtp.config, smtp.credentials) : emailProvider();
}

async function deliver(provider: EmailProvider, workspaceName: string, campaign: { id: string; workspaceId: string; subject: string; body: string; previewText: string | null }, lead: { id: string; email: string | null; firstName: string; lastName: string | null; company: string | null }, step: number) {
  if (!lead.email) return false;
  const token = randomToken(18);
  const send = await db.emailSend
    .create({ data: { workspaceId: campaign.workspaceId, emailCampaignId: campaign.id, leadId: lead.id, email: lead.email, step, trackingToken: token } })
    .catch(() => null); // unique (campaign, lead, step) → already sent
  if (!send) return false;
  const rendered = renderCampaignEmail({ subject: campaign.subject, body: campaign.body, previewText: campaign.previewText, token, lead, workspaceName });
  try {
    await provider.send({ to: lead.email, subject: rendered.subject, html: rendered.html, text: rendered.text, headers: { "List-Unsubscribe": `<${rendered.unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } });
    await db.emailSend.update({ where: { id: send.id }, data: { status: "SENT", sentAt: new Date() } });
    await db.lead.update({ where: { id: lead.id }, data: { lastContactedAt: new Date() } });
    await logActivity(campaign.workspaceId, lead.id, "EMAIL_SENT", `Email sent: ${rendered.subject}`, null, { emailCampaignId: campaign.id, step });
    return true;
  } catch (err) {
    logger.warn("Email delivery failed", { err, sendId: send.id });
    await db.emailSend.update({ where: { id: send.id }, data: { status: "FAILED", error: err instanceof Error ? err.message.slice(0, 300) : "failed" } });
    return false;
  }
}

/** Background processor: sends a broadcast, or the first step of a sequence. */
export async function processSendCampaign(emailCampaignId: string) {
  const campaign = await db.emailCampaign.findUnique({ where: { id: emailCampaignId }, include: { workspace: { select: { name: true } } } });
  if (!campaign || !["SENDING", "ACTIVE"].includes(campaign.status)) return;
  const provider = await providerFor(campaign.workspaceId);
  const leads = await db.lead.findMany({ where: segmentWhere(campaign.workspaceId, campaign.segment as Segment), select: { id: true, email: true, firstName: true, lastName: true, company: true }, take: 100_000 });
  let delivered = 0;
  for (const lead of leads) {
    if (await deliver(provider, campaign.workspace.name, campaign, lead, 0)) delivered++;
  }
  await recordUsage({ workspaceId: campaign.workspaceId, metric: "EMAILS_SENT", quantity: delivered, refType: "EmailCampaign", refId: campaign.id });
  await db.emailCampaign.update({
    where: { id: campaign.id },
    data: {
      recipientsCount: { increment: leads.length },
      deliveredCount: { increment: delivered },
      sentAt: campaign.sentAt ?? new Date(),
      ...(campaign.type === "BROADCAST" ? { status: delivered === 0 && leads.length > 0 ? "FAILED" : "SENT" } : {}),
    },
  });
}

/** Scheduler: start due scheduled campaigns and advance active sequences. */
export async function processScheduledEmail() {
  const due = await db.emailCampaign.findMany({ where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } }, select: { id: true, type: true } });
  for (const c of due) {
    await db.emailCampaign.update({ where: { id: c.id }, data: { status: c.type === "SEQUENCE" ? "ACTIVE" : "SENDING" } });
    await enqueue("email", { kind: "send-campaign", emailCampaignId: c.id });
  }

  const sequences = await db.emailCampaign.findMany({ where: { type: "SEQUENCE", status: "ACTIVE" }, include: { workspace: { select: { name: true } } } });
  let advanced = 0;
  for (const seq of sequences) {
    const steps = (seq.steps ?? []) as SequenceStep[];
    if (!steps.length) continue;
    const provider = await providerFor(seq.workspaceId);
    const sends = await db.emailSend.findMany({ where: { emailCampaignId: seq.id, status: "SENT" }, select: { leadId: true, step: true, sentAt: true } });
    const latest = new Map<string, { step: number; sentAt: Date }>();
    for (const s of sends) {
      if (!s.leadId || !s.sentAt) continue;
      const cur = latest.get(s.leadId);
      if (!cur || s.step > cur.step) latest.set(s.leadId, { step: s.step, sentAt: s.sentAt });
    }
    for (const [leadId, last] of latest) {
      const next = steps[last.step]; // steps[0] is follow-up #1 (step index 1)
      if (!next) continue;
      if (Date.now() - last.sentAt.getTime() < next.delayDays * 86400_000) continue;
      const lead = await db.lead.findFirst({ where: { id: leadId, unsubscribedAt: null, deletedAt: null }, select: { id: true, email: true, firstName: true, lastName: true, company: true } });
      if (!lead) continue;
      const ok = await deliver(provider, seq.workspace.name, { ...seq, subject: next.subject, body: next.body, previewText: null }, lead, last.step + 1);
      if (ok) {
        advanced++;
        await db.emailCampaign.update({ where: { id: seq.id }, data: { deliveredCount: { increment: 1 } } });
        await recordUsage({ workspaceId: seq.workspaceId, metric: "EMAILS_SENT", quantity: 1, refType: "EmailCampaign", refId: seq.id });
      }
    }
  }
  return { started: due.length, advanced };
}

export async function trackOpen(token: string) {
  const send = await db.emailSend.findUnique({ where: { trackingToken: token } });
  if (!send || send.openedAt) return;
  await db.emailSend.update({ where: { id: send.id }, data: { openedAt: new Date() } });
  await db.emailCampaign.update({ where: { id: send.emailCampaignId }, data: { openCount: { increment: 1 } } });
  if (send.leadId) await logActivity(send.workspaceId, send.leadId, "EMAIL_OPENED", "Opened an email", null, { emailCampaignId: send.emailCampaignId });
}

export async function trackClick(token: string, url: string, sig: string): Promise<string | null> {
  if (!/^https?:\/\//.test(url) || !verifyClick(token, url, sig)) return null;
  const send = await db.emailSend.findUnique({ where: { trackingToken: token } });
  if (send && !send.clickedAt) {
    await db.emailSend.update({ where: { id: send.id }, data: { clickedAt: new Date(), openedAt: send.openedAt ?? new Date() } });
    await db.emailCampaign.update({ where: { id: send.emailCampaignId }, data: { clickCount: { increment: 1 }, ...(send.openedAt ? {} : { openCount: { increment: 1 } }) } });
    if (send.leadId) await logActivity(send.workspaceId, send.leadId, "EMAIL_CLICKED", `Clicked ${new URL(url).hostname}`, null, { url });
  }
  return url;
}

export async function unsubscribe(token: string) {
  const send = await db.emailSend.findUnique({ where: { trackingToken: token }, include: { workspace: { select: { name: true } } } });
  if (!send) return null;
  if (send.leadId) {
    const lead = await db.lead.findUnique({ where: { id: send.leadId } });
    if (lead && !lead.unsubscribedAt) {
      await db.lead.update({ where: { id: lead.id }, data: { unsubscribedAt: new Date() } });
      await db.emailCampaign.update({ where: { id: send.emailCampaignId }, data: { unsubscribeCount: { increment: 1 } } });
      await logActivity(send.workspaceId, lead.id, "NOTE", "Unsubscribed from marketing email", null);
    }
  }
  return { workspaceName: send.workspace.name, email: send.email };
}

export async function resubscribeLead(ctx: WorkspaceContext, leadId: string) {
  const lead = await db.lead.findFirst({ where: { id: leadId, workspaceId: ctx.workspace.id } });
  if (!lead) throw notFound("Lead");
  await db.lead.update({ where: { id: leadId }, data: { unsubscribedAt: null } });
  await audit({ action: "lead.resubscribed", workspaceId: ctx.workspace.id, actorId: ctx.user.id, entityId: leadId });
}

export async function sendTestEmail(ctx: WorkspaceContext, id: string) {
  const c = await getEmailCampaign(ctx.workspace.id, id);
  const provider = await providerFor(ctx.workspace.id);
  const [first, ...rest] = ctx.user.name.split(" ");
  const rendered = renderCampaignEmail({ subject: `[Test] ${c.subject}`, body: c.body, previewText: c.previewText, token: "test", lead: { firstName: first, lastName: rest.join(" "), email: ctx.user.email, company: ctx.workspace.name }, workspaceName: ctx.workspace.name });
  await provider.send({ to: ctx.user.email, subject: rendered.subject, html: rendered.html, text: rendered.text });
  return { sentTo: ctx.user.email };
}

export async function emailStats(workspaceId: string) {
  const agg = await db.emailCampaign.aggregate({ where: { workspaceId }, _sum: { deliveredCount: true, openCount: true, clickCount: true, conversionCount: true, unsubscribeCount: true } });
  const s = agg._sum;
  const delivered = s.deliveredCount ?? 0;
  return {
    delivered,
    openRate: delivered ? (s.openCount ?? 0) / delivered : 0,
    clickRate: delivered ? (s.clickCount ?? 0) / delivered : 0,
    conversionRate: delivered ? (s.conversionCount ?? 0) / delivered : 0,
    unsubscribes: s.unsubscribeCount ?? 0,
    unsubscribedLeads: await db.lead.count({ where: { workspaceId, unsubscribedAt: { not: null } } }),
  };
}

export async function unsubscribedLeads(workspaceId: string) {
  return db.lead.findMany({ where: { workspaceId, unsubscribedAt: { not: null }, deletedAt: null }, select: { id: true, firstName: true, lastName: true, email: true, unsubscribedAt: true }, orderBy: { unsubscribedAt: "desc" }, take: 200 });
}

export async function emailWriterStream(ctx: WorkspaceContext, input: { goal: string; audience?: string; tone?: string; kind: "email" | "subject-lines" | "sequence" }) {
  const echo = await db.aIWorker.findFirst({ where: { workspaceId: ctx.workspace.id, key: "email-specialist" } });
  const prompts = {
    email: `Write a marketing email body in Markdown (no subject line, no preview text) for: ${input.goal}. Audience: ${input.audience ?? "our leads"}. Use {{first_name}} and one clear CTA link [CTA text]({{cta_url}}). Keep it under 180 words.`,
    "subject-lines": `Write 8 subject lines for this email, one per line, no numbering: ${input.goal}`,
    sequence: `Design a 3-step follow-up sequence for: ${input.goal}. For each step give: delay in days, subject line and body (Markdown, under 120 words, use {{first_name}}).`,
  } as const;
  return streamText({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    feature: `email:${input.kind}`,
    system: `${echo?.systemPrompt ?? "You are an email marketer."} Output only the requested content. Tone: ${input.tone ?? "Friendly"}.`,
    messages: [{ role: "user", content: prompts[input.kind] }],
  });
}
