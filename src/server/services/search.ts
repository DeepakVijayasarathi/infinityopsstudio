import { db } from "../db";

export type SearchResult = { type: "campaign" | "content" | "lead" | "worker" | "workflow" | "document"; id: string; title: string; subtitle?: string; href: string };

/** Global search across tenant entities (always workspace-scoped). */
export async function globalSearch(workspaceId: string, q: string, limit = 6): Promise<SearchResult[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const ci = { contains: term, mode: "insensitive" as const };
  const [campaigns, contents, leads, workers, workflows, files] = await Promise.all([
    db.campaign.findMany({ where: { workspaceId, deletedAt: null, OR: [{ name: ci }, { description: ci }] }, select: { id: true, name: true, status: true }, take: limit }),
    db.content.findMany({ where: { workspaceId, deletedAt: null, OR: [{ title: ci }, { body: ci }] }, select: { id: true, title: true, type: true }, take: limit }),
    db.lead.findMany({ where: { workspaceId, deletedAt: null, OR: [{ firstName: ci }, { lastName: ci }, { email: ci }, { company: ci }] }, select: { id: true, firstName: true, lastName: true, company: true, email: true }, take: limit }),
    db.aIWorker.findMany({ where: { workspaceId, OR: [{ name: ci }, { title: ci }, { description: ci }] }, select: { id: true, name: true, title: true }, take: limit }),
    db.workflow.findMany({ where: { workspaceId, OR: [{ name: ci }, { description: ci }] }, select: { id: true, name: true, trigger: true }, take: limit }),
    db.file.findMany({ where: { workspaceId, deletedAt: null, filename: ci }, select: { id: true, filename: true, mimeType: true }, take: limit }),
  ]);
  return [
    ...campaigns.map((c) => ({ type: "campaign" as const, id: c.id, title: c.name, subtitle: c.status, href: `/app/campaigns/${c.id}` })),
    ...contents.map((c) => ({ type: "content" as const, id: c.id, title: c.title, subtitle: c.type, href: `/app/content/${c.id}` })),
    ...leads.map((l) => ({ type: "lead" as const, id: l.id, title: `${l.firstName} ${l.lastName ?? ""}`.trim(), subtitle: l.company ?? l.email ?? undefined, href: `/app/leads/${l.id}` })),
    ...workers.map((w) => ({ type: "worker" as const, id: w.id, title: w.name, subtitle: w.title, href: `/app/workers/${w.id}` })),
    ...workflows.map((w) => ({ type: "workflow" as const, id: w.id, title: w.name, subtitle: w.trigger, href: `/app/automations/${w.id}` })),
    ...files.map((f) => ({ type: "document" as const, id: f.id, title: f.filename, subtitle: f.mimeType, href: `/app/settings/files` })),
  ];
}
