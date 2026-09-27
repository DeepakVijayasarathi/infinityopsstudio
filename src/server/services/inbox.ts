import { createHmac } from "node:crypto";
import type { ConversationChannel, ConversationStatus, Prisma } from "@prisma/client";
import { db } from "../db";
import { AppError, badRequest, notFound } from "../errors";
import { audit } from "../audit";
import { logger } from "../logger";
import { safeEqual } from "../crypto";
import { generateText } from "../ai/service";
import { layout, escapeHtml } from "../email/templates";
import type { WorkspaceContext } from "../tenant";
import { paginated, pageArgs, type PaginationInput } from "../pagination";
import { integrationCredentials } from "./integrations";
import { providerFor } from "./email";
import { createLead, logActivity } from "./leads";
import { notify } from "./notifications";
import { chatSystemPrompt } from "./website";

/**
 * Unified inbox: website chat, WhatsApp (Cloud API) and email in one list. Agents reply from
 * one place; replies go out on the conversation's own channel.
 */

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;

export async function listConversations(workspaceId: string, p: PaginationInput & { status?: ConversationStatus; channel?: ConversationChannel }) {
  const where: Prisma.ConversationWhereInput = {
    workspaceId,
    ...(p.status ? { status: p.status } : {}),
    ...(p.channel ? { channel: p.channel } : {}),
    ...(p.q ? { OR: [{ contactName: { contains: p.q, mode: "insensitive" } }, { contactHandle: { contains: p.q, mode: "insensitive" } }, { subject: { contains: p.q, mode: "insensitive" } }] } : {}),
  };
  const [items, total, unread] = await Promise.all([
    db.conversation.findMany({
      where,
      orderBy: { lastMessageAt: "desc" },
      include: { lead: { select: { id: true, firstName: true, lastName: true, score: true } }, messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, direction: true, author: true, createdAt: true } } },
      ...pageArgs(p),
    }),
    db.conversation.count({ where }),
    db.conversation.count({ where: { workspaceId, unread: { gt: 0 }, status: "OPEN" } }),
  ]);
  return { ...paginated(items.map(({ messages, ...c }) => ({ ...c, last: messages[0] ?? null })), total, p), unread };
}

export async function getConversation(workspaceId: string, id: string, markRead = true) {
  const c = await db.conversation.findFirst({
    where: { id, workspaceId },
    include: { lead: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, company: true, score: true, status: true } }, messages: { orderBy: { createdAt: "asc" }, take: 500, include: { user: { select: { name: true } } } } },
  });
  if (!c) throw notFound("Conversation");
  if (markRead && c.unread) await db.conversation.update({ where: { id }, data: { unread: 0 } });
  return c;
}

// ─── Outbound delivery per channel ───

async function sendWhatsApp(workspaceId: string, to: string, body: string): Promise<string | null> {
  const wa = await integrationCredentials(workspaceId, "whatsapp");
  if (!wa) throw new AppError("BAD_REQUEST", "Connect WhatsApp Business in Integrations to reply on WhatsApp");
  const res = await fetch(`https://graph.facebook.com/v19.0/${encodeURIComponent(wa.config.phoneNumberId ?? "")}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${wa.credentials.accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: to.replace(/[^\d]/g, ""), type: "text", text: { body: body.slice(0, 4096), preview_url: true } }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
  if (!res.ok) throw new AppError("SERVICE_UNAVAILABLE", `WhatsApp: ${json.error?.message ?? `HTTP ${res.status}`}${res.status === 400 ? " (outside the 24-hour window you can only send approved templates)" : ""}`);
  return json.messages?.[0]?.id ?? null;
}

async function sendEmailReply(workspaceId: string, convo: { externalId: string; subject: string | null }, body: string, inReplyTo: string | null) {
  const [provider, ws, kit] = await Promise.all([providerFor(workspaceId), db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { name: true } }), db.brandKit.findUnique({ where: { workspaceId }, select: { companyName: true } })]);
  const subject = convo.subject ? (/^re:/i.test(convo.subject) ? convo.subject : `Re: ${convo.subject}`) : `Message from ${kit?.companyName ?? ws.name}`;
  const html = layout(subject, body.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join(""), escapeHtml(kit?.companyName ?? ws.name));
  const sent = await provider.send({ to: convo.externalId, subject, html, text: body, headers: inReplyTo ? { "In-Reply-To": inReplyTo, References: inReplyTo } : undefined });
  return sent.id;
}

/** Sends an agent reply on the conversation's channel and records it (failures are kept, marked failed). */
export async function reply(ctx: WorkspaceContext, id: string, body: string) {
  const convo = await getConversation(ctx.workspace.id, id, false);
  const text = body.trim();
  if (!text) throw badRequest("Write a reply first");
  let externalId: string | null = null;
  let error: string | null = null;
  try {
    if (convo.channel === "WHATSAPP") externalId = await sendWhatsApp(ctx.workspace.id, convo.externalId, text);
    if (convo.channel === "EMAIL") externalId = await sendEmailReply(ctx.workspace.id, convo, text, [...convo.messages].reverse().find((m) => m.direction === "IN" && m.externalId)?.externalId ?? null);
    // Website chat: the widget picks the reply up on its next poll.
  } catch (err) {
    error = err instanceof Error ? err.message : "Delivery failed";
    logger.warn("Inbox reply delivery failed", { err, conversationId: id });
  }
  const msg = await db.message.create({ data: { conversationId: id, workspaceId: ctx.workspace.id, direction: "OUT", author: "AGENT", body: text, userId: ctx.user.id, externalId, failed: !!error, error } });
  await db.conversation.update({ where: { id }, data: { lastMessageAt: new Date(), unread: 0, status: "OPEN" } });
  if (convo.leadId && !error) {
    await db.lead.update({ where: { id: convo.leadId }, data: { lastContactedAt: new Date() } });
    await logActivity(ctx.workspace.id, convo.leadId, convo.channel === "EMAIL" ? "EMAIL_SENT" : "NOTE", `${convo.channel === "WEBSITE" ? "Website chat" : convo.channel === "WHATSAPP" ? "WhatsApp" : "Email"} reply: “${text.slice(0, 300)}”`, ctx.user.id);
  }
  if (error) throw new AppError("SERVICE_UNAVAILABLE", `Saved, but not delivered: ${error}`);
  return msg;
}

/** Drafts a reply with AI (not sent). */
export async function suggestReply(ctx: WorkspaceContext, id: string) {
  const convo = await getConversation(ctx.workspace.id, id, false);
  if (!convo.messages.length) throw badRequest("Nothing to reply to yet");
  const kit = await db.brandKit.findUnique({ where: { workspaceId: ctx.workspace.id }, select: { companyName: true } });
  const channel = convo.channel === "WEBSITE" ? "website chat" : convo.channel === "WHATSAPP" ? "WhatsApp" : "email";
  const r = await generateText({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    feature: "inbox:suggest",
    maxTokens: 600,
    system: `${chatSystemPrompt(kit?.companyName ?? ctx.workspace.name, { name: convo.contactName, email: convo.contactHandle }, channel)}\nYou are drafting a reply for a human team member to review and send.${convo.channel === "EMAIL" ? " Write a short, friendly email body (no subject line), signed as the team." : ""}`,
    messages: convo.messages.slice(-12).map((m) => ({ role: m.direction === "IN" ? ("user" as const) : ("assistant" as const), content: m.body })),
  });
  return { text: r.text.trim() };
}

export async function updateConversation(ctx: WorkspaceContext, id: string, input: { status?: ConversationStatus; aiEnabled?: boolean }) {
  await getConversation(ctx.workspace.id, id, false);
  return db.conversation.update({ where: { id }, data: input });
}

/** Creates (or links an existing) lead from the conversation's contact details. */
export async function linkLead(ctx: WorkspaceContext, id: string) {
  const convo = await getConversation(ctx.workspace.id, id, false);
  if (convo.leadId) return { leadId: convo.leadId };
  const email = convo.channel === "WHATSAPP" ? null : (convo.contactHandle ?? convo.messages.map((m) => m.body.match(EMAIL_RE)?.[0]).find(Boolean) ?? null);
  const phone = convo.channel === "WHATSAPP" ? `+${convo.externalId.replace(/^\+/, "")}` : null;
  const existing = await db.lead.findFirst({ where: { workspaceId: ctx.workspace.id, deletedAt: null, OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])] } });
  const [firstName, ...rest] = (convo.contactName ?? email?.split("@")[0] ?? phone ?? "New contact").split(/\s+/);
  const lead = existing ?? (await createLead(ctx, { firstName: firstName!, lastName: rest.join(" ") || null, email, phone, source: convo.channel === "EMAIL" ? "EMAIL" : convo.channel === "WHATSAPP" ? "SOCIAL" : "WEBSITE", tags: [convo.channel.toLowerCase()] }, { activity: `Created from a ${convo.channel.toLowerCase()} conversation` }));
  await db.conversation.update({ where: { id }, data: { leadId: lead.id } });
  await audit({ action: "inbox.lead_linked", workspaceId: ctx.workspace.id, actorId: ctx.user.id, entityType: "Lead", entityId: lead.id });
  return { leadId: lead.id };
}

// ─── Inbound: shared ───

async function receive(workspaceId: string, channel: ConversationChannel, contact: { externalId: string; name?: string | null; handle?: string | null; subject?: string | null }, body: string, externalMessageId: string | null) {
  if (externalMessageId && (await db.message.findFirst({ where: { workspaceId, externalId: externalMessageId }, select: { id: true } }))) return null; // provider retry
  const key = { workspaceId_channel_externalId: { workspaceId, channel, externalId: contact.externalId } };
  let convo = await db.conversation.findUnique({ where: key });
  const isNew = !convo;
  // WhatsApp and email start with AI auto-replies off; a person decides per conversation.
  convo ??= await db.conversation.create({ data: { workspaceId, channel, externalId: contact.externalId, contactName: contact.name ?? null, contactHandle: contact.handle ?? null, subject: contact.subject ?? null, aiEnabled: false } });
  await db.message.create({ data: { conversationId: convo.id, workspaceId, direction: "IN", author: "CONTACT", body: body.slice(0, 20_000), externalId: externalMessageId } });
  convo = await db.conversation.update({ where: { id: convo.id }, data: { lastMessageAt: new Date(), unread: { increment: 1 }, status: "OPEN", ...(contact.name && !convo.contactName ? { contactName: contact.name } : {}) } });

  // Link to an existing lead with the same email/phone, if any.
  if (!convo.leadId) {
    const lead = await db.lead.findFirst({ where: { workspaceId, deletedAt: null, ...(channel === "EMAIL" ? { email: contact.externalId } : { phone: { contains: contact.externalId.slice(-10) } }) }, select: { id: true } });
    if (lead) convo = await db.conversation.update({ where: { id: convo.id }, data: { leadId: lead.id } });
  }
  if (convo.leadId) await logActivity(workspaceId, convo.leadId, "NOTE", `${channel === "EMAIL" ? "Email" : "WhatsApp"} received: “${body.slice(0, 300)}”`);
  await notify({ workspaceId, type: "inbox.message", title: `${isNew ? "New" : "New reply in"} ${channel === "EMAIL" ? "email" : "WhatsApp"} conversation${contact.name ? ` from ${contact.name}` : ""}`, body: body.slice(0, 140), link: `/app/inbox?c=${convo.id}`, permission: "leads:read" });
  return convo;
}

// ─── Inbound: WhatsApp Cloud API ───

async function whatsappWidget(key: string) {
  const w = await db.websiteWidget.findUnique({ where: { publicKey: key }, select: { workspaceId: true } });
  if (!w) throw notFound("Webhook");
  const wa = await integrationCredentials(w.workspaceId, "whatsapp");
  if (!wa) throw notFound("WhatsApp is not connected");
  return { workspaceId: w.workspaceId, wa };
}

/** Meta's webhook verification handshake (GET with hub.* parameters). */
export async function whatsappVerify(key: string, mode: string | null, token: string | null, challenge: string | null) {
  const { wa } = await whatsappWidget(key);
  if (mode !== "subscribe" || !token || !challenge || !safeEqual(token, wa.config.verifyToken ?? "")) throw new AppError("FORBIDDEN", "Verification failed");
  return challenge;
}

type WaPayload = { entry?: { changes?: { value?: { contacts?: { profile?: { name?: string }; wa_id?: string }[]; messages?: { id: string; from: string; type: string; text?: { body?: string }; button?: { text?: string }; interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } } }[] } }[] }[] };

export async function whatsappInbound(key: string, raw: string, signature: string | null) {
  const { workspaceId, wa } = await whatsappWidget(key);
  const expected = `sha256=${createHmac("sha256", wa.credentials.appSecret ?? "").update(raw).digest("hex")}`;
  if (!signature || !safeEqual(signature, expected)) throw new AppError("UNAUTHENTICATED", "Invalid signature");
  const payload = JSON.parse(raw) as WaPayload;
  let count = 0;
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      for (const m of v?.messages ?? []) {
        const name = v?.contacts?.find((c) => c.wa_id === m.from)?.profile?.name ?? null;
        const body = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? `[${m.type} message]`;
        if (await receive(workspaceId, "WHATSAPP", { externalId: m.from, name, handle: `+${m.from}` }, body, m.id)) count++;
      }
    }
  }
  return { received: count };
}

// ─── Inbound: email (Postmark, SendGrid Inbound Parse, Mailgun or plain JSON) ───

export function parseAddress(value: string | null | undefined): { email: string | null; name: string | null } {
  if (!value) return { email: null, name: null };
  const email = value.match(EMAIL_RE)?.[0]?.toLowerCase() ?? null;
  const name = value.replace(/<[^>]*>/, "").replace(EMAIL_RE, "").replace(/["']/g, "").trim() || null;
  return { email, name };
}

/** Normalizes the inbound-email payload formats of common providers. */
export function normalizeInboundEmail(fields: Record<string, unknown>) {
  const str = (...keys: string[]) => keys.map((k) => fields[k]).find((v) => typeof v === "string" && v.trim()) as string | undefined;
  const from = parseAddress(str("From", "from", "sender"));
  const name = str("FromName") ?? from.name;
  const subject = str("Subject", "subject") ?? null;
  const body = str("StrippedTextReply", "stripped-text", "TextBody", "text", "body-plain", "body") ?? "";
  const messageId = str("MessageID", "Message-Id", "message-id", "messageId") ?? null;
  return { email: from.email, name, subject, body: body.trim(), messageId };
}

export async function emailInbound(token: string, fields: Record<string, unknown>) {
  const w = await db.websiteWidget.findUnique({ where: { inboundEmailToken: token }, select: { workspaceId: true } });
  if (!w) throw notFound("Inbound address");
  const e = normalizeInboundEmail(fields);
  if (!e.email) throw badRequest("Missing sender address");
  if (!e.body) return { received: 0 };
  const convo = await receive(w.workspaceId, "EMAIL", { externalId: e.email, name: e.name, handle: e.email, subject: e.subject }, e.body, e.messageId);
  return { received: convo ? 1 : 0 };
}
