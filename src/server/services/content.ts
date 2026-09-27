import type { ContentStatus, ContentType, Prisma } from "@prisma/client";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { db } from "../db";
import { badRequest, forbidden, notFound } from "../errors";
import { audit } from "../audit";
import { randomToken } from "../crypto";
import { streamText } from "../ai/service";
import { buildGeneratorPrompt, buildInlinePrompt, CONTENT_SYSTEM_PROMPT, GENERATORS, type GeneratorKey, type InlineAction } from "../ai/prompts";
import type { WorkspaceContext } from "../tenant";
import { can } from "../tenant";
import { paginated, pageArgs, orderBy, type PaginationInput } from "../pagination";
import { emitEvent } from "./events";
import { recordUsage } from "../billing/usage";

const VERSION_INTERVAL_MS = 10 * 60 * 1000;

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

export const CONTENT_TRANSITIONS: Record<ContentStatus, ContentStatus[]> = {
  DRAFT: ["IN_REVIEW", "APPROVED", "ARCHIVED"],
  IN_REVIEW: ["DRAFT", "APPROVED"],
  APPROVED: ["DRAFT", "PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["DRAFT", "ARCHIVED"],
  ARCHIVED: ["DRAFT"],
};

export async function listContent(workspaceId: string, p: PaginationInput & { type?: ContentType; status?: ContentStatus; campaignId?: string }) {
  const where: Prisma.ContentWhereInput = {
    workspaceId,
    deletedAt: null,
    ...(p.type ? { type: p.type } : {}),
    ...(p.status ? { status: p.status } : { status: { not: "ARCHIVED" } }),
    ...(p.campaignId ? { campaignId: p.campaignId } : {}),
    ...(p.q ? { OR: [{ title: { contains: p.q, mode: "insensitive" } }, { body: { contains: p.q, mode: "insensitive" } }] } : {}),
  };
  const [items, total] = await Promise.all([
    db.content.findMany({
      where,
      select: {
        id: true, title: true, type: true, status: true, excerpt: true, wordCount: true, generatedByAI: true, updatedAt: true, createdAt: true, tone: true,
        author: { select: { name: true } },
        campaign: { select: { id: true, name: true } },
      },
      orderBy: orderBy(p, ["updatedAt", "createdAt", "title", "wordCount"] as const, "updatedAt"),
      ...pageArgs(p),
    }),
    db.content.count({ where }),
  ]);
  return paginated(items, total, p);
}

export async function getContent(workspaceId: string, id: string) {
  const content = await db.content.findFirst({
    where: { id, workspaceId, deletedAt: null },
    include: {
      author: { select: { name: true } },
      campaign: { select: { id: true, name: true } },
      versions: { orderBy: { version: "desc" }, select: { id: true, version: true, title: true, note: true, createdAt: true, createdById: true } },
    },
  });
  if (!content) throw notFound("Content");
  return content;
}

async function nextVersion(contentId: string) {
  const last = await db.contentVersion.findFirst({ where: { contentId }, orderBy: { version: "desc" } });
  return { number: (last?.version ?? 0) + 1, last };
}

export async function createContent(
  ctx: WorkspaceContext,
  input: { title: string; type: ContentType; body?: string; tone?: string | null; campaignId?: string | null; keywords?: string[]; generatedByAI?: boolean },
) {
  if (input.campaignId) {
    const c = await db.campaign.findFirst({ where: { id: input.campaignId, workspaceId: ctx.workspace.id, deletedAt: null } });
    if (!c) throw notFound("Campaign");
  }
  const body = input.body ?? "";
  const content = await db.content.create({
    data: {
      workspaceId: ctx.workspace.id,
      authorId: ctx.user.id,
      title: input.title,
      type: input.type,
      body,
      tone: input.tone,
      campaignId: input.campaignId,
      keywords: input.keywords ?? [],
      generatedByAI: input.generatedByAI ?? false,
      wordCount: words(body),
      excerpt: body.replace(/[#*_>`\-[\]()]/g, "").trim().slice(0, 200) || null,
      versions: body ? { create: { version: 1, title: input.title, body, note: input.generatedByAI ? "AI generated" : "Created", createdById: ctx.user.id } } : undefined,
    },
  });
  await recordUsage({ workspaceId: ctx.workspace.id, userId: ctx.user.id, metric: "CONTENT_ITEMS", quantity: 1, refType: "Content", refId: content.id });
  await audit({ action: "content.created", workspaceId: ctx.workspace.id, actorId: ctx.user.id, entityType: "Content", entityId: content.id });
  return content;
}

/**
 * Updates content. Autosaves (`autosave: true`) only snapshot a version when the last one is
 * older than 10 minutes; explicit saves always create a version.
 */
export async function updateContent(
  ctx: WorkspaceContext,
  id: string,
  input: { title?: string; body?: string; tone?: string | null; campaignId?: string | null; keywords?: string[]; autosave?: boolean; versionNote?: string },
) {
  const existing = await getContent(ctx.workspace.id, id);
  const { autosave, versionNote, ...data } = input;
  const body = data.body ?? existing.body;
  const title = data.title ?? existing.title;
  const updated = await db.content.update({
    where: { id },
    data: { ...data, wordCount: words(body), excerpt: body.replace(/[#*_>`\-[\]()]/g, "").trim().slice(0, 200) || null },
  });

  const changed = body !== existing.body || title !== existing.title;
  if (changed) {
    const { number, last } = await nextVersion(id);
    const due = !last || Date.now() - last.createdAt.getTime() > VERSION_INTERVAL_MS;
    if (!autosave || due) {
      await db.contentVersion.create({ data: { contentId: id, version: number, title, body, note: versionNote ?? (autosave ? "Autosave" : "Saved"), createdById: ctx.user.id } });
    }
  }
  return updated;
}

export async function getVersion(workspaceId: string, contentId: string, versionId: string) {
  await getContent(workspaceId, contentId);
  const v = await db.contentVersion.findFirst({ where: { id: versionId, contentId } });
  if (!v) throw notFound("Version");
  return v;
}

export async function restoreVersion(ctx: WorkspaceContext, contentId: string, versionId: string) {
  const v = await getVersion(ctx.workspace.id, contentId, versionId);
  return updateContent(ctx, contentId, { title: v.title, body: v.body, versionNote: `Restored version ${v.version}` });
}

export async function changeContentStatus(ctx: WorkspaceContext, id: string, status: ContentStatus) {
  const existing = await getContent(ctx.workspace.id, id);
  if (!CONTENT_TRANSITIONS[existing.status].includes(status)) throw badRequest(`Cannot move content from ${existing.status.toLowerCase()} to ${status.toLowerCase()}`);
  if ((status === "APPROVED" || status === "PUBLISHED") && !can(ctx, "content:approve")) throw forbidden("Only managers can approve or publish content");
  const updated = await db.content.update({ where: { id }, data: { status, ...(status === "PUBLISHED" ? { publishedAt: new Date() } : {}) } });
  await audit({ action: "content.status_changed", workspaceId: ctx.workspace.id, actorId: ctx.user.id, entityType: "Content", entityId: id, metadata: { from: existing.status, to: status } });
  if (status === "PUBLISHED") {
    await emitEvent(ctx.workspace.id, "CONTENT_PUBLISHED", { contentId: id, title: updated.title, type: updated.type, body: updated.body.slice(0, 4000) });
  }
  return updated;
}

export async function deleteContent(ctx: WorkspaceContext, id: string) {
  await getContent(ctx.workspace.id, id);
  await db.content.update({ where: { id }, data: { deletedAt: new Date(), shareToken: null } });
  await audit({ action: "content.deleted", workspaceId: ctx.workspace.id, actorId: ctx.user.id, entityType: "Content", entityId: id });
}

export async function setSharing(ctx: WorkspaceContext, id: string, enabled: boolean) {
  await getContent(ctx.workspace.id, id);
  const shareToken = enabled ? randomToken(18) : null;
  await db.content.update({ where: { id }, data: { shareToken } });
  await audit({ action: enabled ? "content.shared" : "content.unshared", workspaceId: ctx.workspace.id, actorId: ctx.user.id, entityType: "Content", entityId: id });
  return { shareToken };
}

export async function getSharedContent(token: string) {
  return db.content.findFirst({
    where: { shareToken: token, deletedAt: null },
    select: { title: true, body: true, type: true, updatedAt: true, workspace: { select: { name: true } } },
  });
}

/** Markdown → sanitized HTML (safe for rendering and export). */
export function renderMarkdown(md: string): string {
  const raw = marked.parse(md, { async: false, gfm: true, breaks: false }) as string;
  return sanitizeHtml(raw, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["h1", "h2", "img", "del", "input"]),
    allowedAttributes: { a: ["href", "title", "target", "rel"], img: ["src", "alt", "title"], input: ["type", "checked", "disabled"], th: ["align"], td: ["align"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: { a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer nofollow", target: "_blank" }) },
  });
}

export function exportContent(content: { title: string; body: string }, format: "md" | "html" | "txt") {
  const safeName = content.title.replace(/[^a-z0-9-_ ]/gi, "").trim().replace(/\s+/g, "-").toLowerCase() || "content";
  if (format === "md") return { filename: `${safeName}.md`, mime: "text/markdown; charset=utf-8", body: `# ${content.title}\n\n${content.body}` };
  if (format === "txt") {
    const text = content.body.replace(/[#*_`>]/g, "").replace(/\[(.*?)\]\((.*?)\)/g, "$1 ($2)");
    return { filename: `${safeName}.txt`, mime: "text/plain; charset=utf-8", body: `${content.title}\n\n${text}` };
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${sanitizeHtml(content.title, { allowedTags: [] })}</title><style>body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;line-height:1.65;color:#0f172a;padding:0 16px}table{border-collapse:collapse}td,th{border:1px solid #e2e8f0;padding:6px 10px}</style></head><body><h1>${sanitizeHtml(content.title, { allowedTags: [] })}</h1>${renderMarkdown(content.body)}</body></html>`;
  return { filename: `${safeName}.html`, mime: "text/html; charset=utf-8", body: html };
}

// ─── AI generation ───

export async function generateContentStream(
  ctx: WorkspaceContext,
  input: { generator: GeneratorKey; values: Record<string, string | undefined>; tone?: string; model?: string | null; save?: { title: string; campaignId?: string | null } },
) {
  const g = GENERATORS[input.generator];
  if (!g) throw badRequest("Unknown generator");
  const prompt = buildGeneratorPrompt(input.generator, input.values, input.tone);
  let savedId: string | null = null;
  const stream = await streamText(
    { workspaceId: ctx.workspace.id, userId: ctx.user.id, feature: `content:${input.generator}`, system: CONTENT_SYSTEM_PROMPT, messages: [{ role: "user", content: prompt }], model: input.model },
    async (text) => {
      if (input.save) {
        const created = await createContent(ctx, { title: input.save.title, type: g.type, body: text, tone: input.tone, campaignId: input.save.campaignId, generatedByAI: true, keywords: input.values.keywords?.split(",").map((k) => k.trim()).filter(Boolean) });
        savedId = created.id;
      }
    },
  );
  return { stream, getSavedId: () => savedId };
}

export async function inlineActionStream(ctx: WorkspaceContext, input: { action: InlineAction; text: string; tone?: string; format?: string; model?: string | null }) {
  if (!input.text.trim()) throw badRequest("Select or provide some text first");
  return streamText({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    feature: `content:inline:${input.action}`,
    system: CONTENT_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildInlinePrompt(input.action, input.text, { tone: input.tone, format: input.format }) }],
    model: input.model,
  });
}
