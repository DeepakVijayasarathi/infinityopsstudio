import type { KeywordStatus, Prisma } from "@prisma/client";
import { db } from "../db";
import { badRequest, notFound } from "../errors";
import { audit } from "../audit";
import { safeFetch } from "../net";
import { generateText, streamText } from "../ai/service";
import type { WorkspaceContext } from "../tenant";
import { analyzeHtml, suggestInternalLinks } from "./seo-audit";

export async function listProjects(workspaceId: string) {
  return db.sEOProject.findMany({ where: { workspaceId }, include: { _count: { select: { keywords: true } } }, orderBy: { createdAt: "asc" } });
}

export async function getProject(workspaceId: string, id: string) {
  const p = await db.sEOProject.findFirst({ where: { id, workspaceId } });
  if (!p) throw notFound("SEO project");
  return p;
}

export async function createProject(ctx: WorkspaceContext, input: { name: string; domain: string; competitors?: string[] }) {
  const domain = input.domain.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw badRequest("Enter a valid domain like example.com");
  const p = await db.sEOProject.create({ data: { workspaceId: ctx.workspace.id, name: input.name, domain, competitors: input.competitors ?? [] } });
  await audit({ action: "seo.project_created", workspaceId: ctx.workspace.id, actorId: ctx.user.id, entityType: "SEOProject", entityId: p.id });
  return p;
}

export async function updateProject(ctx: WorkspaceContext, id: string, input: { name?: string; competitors?: string[] }) {
  await getProject(ctx.workspace.id, id);
  return db.sEOProject.update({ where: { id }, data: input });
}

export async function deleteProject(ctx: WorkspaceContext, id: string) {
  await getProject(ctx.workspace.id, id);
  await db.sEOProject.delete({ where: { id } });
}

export async function runAudit(ctx: WorkspaceContext, id: string, path = "/") {
  const project = await getProject(ctx.workspace.id, id);
  const target = `https://${project.domain}${path.startsWith("/") ? path : `/${path}`}`;
  const started = Date.now();
  let result;
  try {
    const { res, url } = await safeFetch(target, { headers: { "user-agent": "InfinityOpsStudio-SEO-Audit/1.0", accept: "text/html" } });
    const html = (await res.text()).slice(0, 3_000_000);
    result = analyzeHtml(html, url.toString(), { status: res.status, responseMs: Date.now() - started, https: url.protocol === "https:", bytes: html.length });
  } catch (err) {
    if (err instanceof Error && err.name === "AppError") throw err;
    throw badRequest(`Could not fetch ${target}. Check that the site is reachable.`);
  }
  await db.sEOProject.update({ where: { id }, data: { score: result.score, auditResult: result as unknown as Prisma.InputJsonValue, lastAuditAt: new Date() } });
  await audit({ action: "seo.audit_run", workspaceId: ctx.workspace.id, actorId: ctx.user.id, entityType: "SEOProject", entityId: id, metadata: { score: result.score } });
  return result;
}

export async function listKeywords(workspaceId: string, projectId: string, status?: KeywordStatus) {
  await getProject(workspaceId, projectId);
  return db.keyword.findMany({ where: { workspaceId, projectId, ...(status ? { status } : { status: { not: "ARCHIVED" } }) }, orderBy: [{ status: "asc" }, { searchVolume: "desc" }] });
}

export type KeywordInput = { term: string; searchVolume?: number; difficulty?: number; cpcCents?: number; intent?: string | null; position?: number | null; targetUrl?: string | null; status?: KeywordStatus };

export async function addKeywords(ctx: WorkspaceContext, projectId: string, items: KeywordInput[]) {
  await getProject(ctx.workspace.id, projectId);
  const clean = items.map((k) => ({ ...k, term: k.term.trim().toLowerCase() })).filter((k) => k.term.length > 1);
  if (!clean.length) throw badRequest("Add at least one keyword");
  const res = await db.keyword.createMany({ data: clean.map((k) => ({ ...k, workspaceId: ctx.workspace.id, projectId })), skipDuplicates: true });
  return { created: res.count, skipped: clean.length - res.count };
}

export async function updateKeyword(ctx: WorkspaceContext, id: string, input: Partial<KeywordInput>) {
  const kw = await db.keyword.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!kw) throw notFound("Keyword");
  const positionChange = input.position !== undefined && input.position !== kw.position ? { previousPosition: kw.position } : {};
  return db.keyword.update({ where: { id }, data: { ...input, ...positionChange } });
}

export async function deleteKeyword(ctx: WorkspaceContext, id: string) {
  const kw = await db.keyword.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!kw) throw notFound("Keyword");
  await db.keyword.delete({ where: { id } });
}

/** AI keyword ideas parsed from a Markdown table: | Keyword | Intent | Difficulty | ... */
export async function suggestKeywords(ctx: WorkspaceContext, projectId: string, seed: string) {
  const project = await getProject(ctx.workspace.id, projectId);
  const atlas = await db.aIWorker.findFirst({ where: { workspaceId: ctx.workspace.id, key: "seo-specialist" } });
  const result = await generateText({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    feature: "seo:keyword-suggestions",
    system: atlas?.systemPrompt,
    messages: [{ role: "user", content: `Suggest 12 keywords for ${project.domain} about "${seed}". Reply ONLY with a Markdown table with columns: Keyword | Intent | Difficulty (Low/Medium/High).` }],
    maxTokens: 1500,
  });
  const existing = new Set((await db.keyword.findMany({ where: { projectId }, select: { term: true } })).map((k) => k.term));
  const diff: Record<string, number> = { low: 25, medium: 50, med: 50, high: 75 };
  const rows = result.text
    .split("\n")
    .filter((l) => l.trim().startsWith("|") && !/^\|\s*-/.test(l.trim()))
    .map((l) => l.split("|").map((c) => c.trim()).filter(Boolean))
    .filter((c) => c.length >= 2 && !/^keyword$/i.test(c[0]!));
  return rows.map((c) => ({ term: c[0]!.toLowerCase(), intent: c[1] ?? null, difficulty: diff[(c[2] ?? "").toLowerCase()] ?? 50, exists: existing.has(c[0]!.toLowerCase()) })).slice(0, 15);
}

export async function contentOpportunities(workspaceId: string) {
  const [keywords, contents] = await Promise.all([
    db.keyword.findMany({ where: { workspaceId, status: { in: ["OPPORTUNITY", "TRACKING"] } }, orderBy: { searchVolume: "desc" }, take: 100 }),
    db.content.findMany({ where: { workspaceId, deletedAt: null }, select: { title: true, body: true, keywords: true } }),
  ]);
  const corpus = contents.map((c) => `${c.title} ${c.keywords.join(" ")} ${c.body.slice(0, 2000)}`.toLowerCase());
  return keywords
    .filter((k) => !corpus.some((c) => c.includes(k.term)))
    .map((k) => ({ id: k.id, term: k.term, searchVolume: k.searchVolume, difficulty: k.difficulty, intent: k.intent, opportunity: Math.round((k.searchVolume / Math.max(1, k.difficulty)) * 10) / 10 }))
    .sort((a, b) => b.opportunity - a.opportunity)
    .slice(0, 20);
}

export async function internalLinkSuggestions(workspaceId: string, contentId: string) {
  const source = await db.content.findFirst({ where: { id: contentId, workspaceId, deletedAt: null }, select: { id: true, title: true, keywords: true, body: true } });
  if (!source) throw notFound("Content");
  const candidates = await db.content.findMany({ where: { workspaceId, deletedAt: null, type: { in: ["BLOG_POST", "LANDING_PAGE"] } }, select: { id: true, title: true, keywords: true } });
  return suggestInternalLinks(source, candidates);
}

export async function competitorResearchStream(ctx: WorkspaceContext, projectId: string) {
  const project = await getProject(ctx.workspace.id, projectId);
  if (!project.competitors.length) throw badRequest("Add at least one competitor to the project");
  const atlas = await db.aIWorker.findFirst({ where: { workspaceId: ctx.workspace.id, key: "seo-specialist" } });
  return streamText({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    feature: "seo:competitor-research",
    system: atlas?.systemPrompt,
    messages: [{ role: "user", content: `Compare the SEO strategy of ${project.domain} with these competitors: ${project.competitors.join(", ")}. Cover likely keyword focus, content formats, topical gaps we can exploit, backlink angles and a prioritized 60-day action plan.` }],
  });
}

export async function seoReport(workspaceId: string, projectId: string) {
  const project = await getProject(workspaceId, projectId);
  const keywords = await db.keyword.findMany({ where: { projectId, status: { not: "ARCHIVED" } } });
  const ranked = keywords.filter((k) => k.position !== null);
  const improved = ranked.filter((k) => k.previousPosition !== null && k.position! < k.previousPosition!).length;
  const declined = ranked.filter((k) => k.previousPosition !== null && k.position! > k.previousPosition!).length;
  return {
    project: { id: project.id, name: project.name, domain: project.domain, score: project.score, lastAuditAt: project.lastAuditAt },
    keywords: {
      total: keywords.length,
      top3: ranked.filter((k) => k.position! <= 3).length,
      top10: ranked.filter((k) => k.position! <= 10).length,
      improved,
      declined,
      avgPosition: ranked.length ? Math.round((ranked.reduce((a, k) => a + k.position!, 0) / ranked.length) * 10) / 10 : null,
      totalVolume: keywords.reduce((a, k) => a + k.searchVolume, 0),
    },
  };
}
