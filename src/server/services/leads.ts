import type { LeadSource, LeadStatus, LeadActivityType, Prisma } from "@prisma/client";
import { db } from "../db";
import { badRequest, notFound, paymentRequired } from "../errors";
import { audit } from "../audit";
import type { WorkspaceContext } from "../tenant";
import { paginated, pageArgs, orderBy, type PaginationInput } from "../pagination";
import { emitEvent } from "./events";
import { notify } from "./notifications";
import { parseCsvObjects, toCsv } from "@/lib/csv";
import { LEAD_SOURCES, LEAD_STATUSES } from "@/lib/constants";
import { getPlan, withinLimit } from "@/config/plans";

export type LeadInput = {
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  website?: string | null;
  source?: LeadSource;
  status?: LeadStatus;
  tags?: string[];
  valueCents?: number;
  ownerId?: string | null;
  campaignId?: string | null;
};

const SOURCE_POINTS: Record<LeadSource, number> = { REFERRAL: 20, EVENT: 15, WEBSITE: 12, EMAIL: 10, ADS: 8, SOCIAL: 8, API: 5, MANUAL: 5, IMPORT: 3 };
const STATUS_POINTS: Record<LeadStatus, number> = { NEW: 0, CONTACTED: 10, QUALIFIED: 25, PROPOSAL: 35, WON: 40, LOST: 0 };

/** Rule-based lead score (0–100): fit + source + stage + engagement. */
export function scoreLead(lead: { email?: string | null; phone?: string | null; company?: string | null; jobTitle?: string | null; website?: string | null; source: LeadSource; status: LeadStatus }, engagement = { opens: 0, clicks: 0, activities: 0 }): number {
  let score = 0;
  if (lead.email) score += 8;
  if (lead.phone) score += 4;
  if (lead.company) score += 6;
  if (lead.website) score += 2;
  const title = (lead.jobTitle ?? "").toLowerCase();
  if (/\b(ceo|cto|cmo|coo|founder|owner|president|vp|vice president|head|director|chief)\b/.test(title)) score += 15;
  else if (/\b(manager|lead|principal)\b/.test(title)) score += 8;
  else if (title) score += 3;
  score += SOURCE_POINTS[lead.source];
  score += STATUS_POINTS[lead.status];
  score += Math.min(10, engagement.opens * 2) + Math.min(10, engagement.clicks * 4) + Math.min(5, engagement.activities);
  return Math.max(0, Math.min(100, score));
}

async function recalcScore(leadId: string) {
  const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
  const [opens, clicks, activities] = await Promise.all([
    db.emailSend.count({ where: { leadId, openedAt: { not: null } } }),
    db.emailSend.count({ where: { leadId, clickedAt: { not: null } } }),
    db.leadActivity.count({ where: { leadId, type: { in: ["NOTE", "CALL", "MEETING"] } } }),
  ]);
  const score = scoreLead(lead, { opens, clicks, activities });
  if (score !== lead.score) await db.lead.update({ where: { id: leadId }, data: { score } });
  return score;
}

export async function logActivity(workspaceId: string, leadId: string, type: LeadActivityType, content: string, actorId?: string | null, metadata?: Prisma.InputJsonValue) {
  return db.leadActivity.create({ data: { workspaceId, leadId, type, content, actorId: actorId ?? null, metadata } });
}

export async function listLeads(workspaceId: string, p: PaginationInput & { status?: LeadStatus; source?: LeadSource; tag?: string; minScore?: number; campaignId?: string }) {
  const where: Prisma.LeadWhereInput = {
    workspaceId,
    deletedAt: null,
    ...(p.status ? { status: p.status } : {}),
    ...(p.source ? { source: p.source } : {}),
    ...(p.tag ? { tags: { has: p.tag } } : {}),
    ...(p.minScore ? { score: { gte: p.minScore } } : {}),
    ...(p.campaignId ? { campaignId: p.campaignId } : {}),
    ...(p.q
      ? { OR: ["firstName", "lastName", "email", "company"].map((f) => ({ [f]: { contains: p.q, mode: "insensitive" } })) as Prisma.LeadWhereInput[] }
      : {}),
  };
  const [items, total] = await Promise.all([
    db.lead.findMany({
      where,
      include: { owner: { select: { id: true, name: true } }, campaign: { select: { id: true, name: true } } },
      orderBy: orderBy(p, ["createdAt", "updatedAt", "score", "valueCents", "firstName", "company"] as const, "createdAt"),
      ...pageArgs(p),
    }),
    db.lead.count({ where }),
  ]);
  return paginated(items, total, p);
}

export async function getLead(workspaceId: string, id: string) {
  const lead = await db.lead.findFirst({
    where: { id, workspaceId, deletedAt: null },
    include: {
      owner: { select: { id: true, name: true } },
      campaign: { select: { id: true, name: true } },
      activities: { orderBy: { createdAt: "desc" }, take: 100 },
      tasks: { orderBy: [{ completedAt: { sort: "asc", nulls: "first" } }, { dueDate: "asc" }] },
      emailSends: { orderBy: { createdAt: "desc" }, take: 20, select: { id: true, sentAt: true, openedAt: true, clickedAt: true, emailCampaign: { select: { id: true, name: true, subject: true } } } },
    },
  });
  if (!lead) throw notFound("Lead");
  const actorIds = [...new Set(lead.activities.map((a) => a.actorId).filter(Boolean) as string[])];
  const actors = actorIds.length ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : [];
  return { ...lead, activities: lead.activities.map((a) => ({ ...a, actor: actors.find((u) => u.id === a.actorId) ?? null })) };
}

async function assertRefs(workspaceId: string, input: Partial<LeadInput>) {
  if (input.campaignId && !(await db.campaign.findFirst({ where: { id: input.campaignId, workspaceId } }))) throw notFound("Campaign");
  if (input.ownerId && !(await db.workspaceMember.findFirst({ where: { workspaceId, userId: input.ownerId } }))) throw notFound("Owner");
}

export async function createLead(ctx: WorkspaceContext | { workspace: { id: string }; user: { id: string; name: string } | null; plan: string }, input: LeadInput, opts: { activity?: string } = {}) {
  const workspaceId = ctx.workspace.id;
  await assertRefs(workspaceId, input);
  const plan = getPlan(ctx.plan as Parameters<typeof getPlan>[0]);
  const count = await db.lead.count({ where: { workspaceId, deletedAt: null } });
  if (!withinLimit(plan.limits.contacts, count)) throw paymentRequired(`The ${plan.name} plan includes ${plan.limits.contacts.toLocaleString()} contacts. Upgrade to add more.`);
  const email = input.email?.toLowerCase().trim() || null;
  if (email) {
    const dup = await db.lead.findFirst({ where: { workspaceId, email } });
    if (dup && !dup.deletedAt) throw badRequest(`A lead with email ${email} already exists`);
    if (dup?.deletedAt) await db.lead.delete({ where: { id: dup.id } });
  }
  const source = input.source ?? "MANUAL";
  const status = input.status ?? "NEW";
  const lead = await db.lead.create({
    data: { ...input, email, source, status, workspaceId, tags: input.tags ?? [], score: scoreLead({ ...input, email, source, status }), ownerId: input.ownerId ?? ctx.user?.id ?? null },
  });
  await logActivity(workspaceId, lead.id, "CREATED", opts.activity ?? `Lead created from ${source.toLowerCase()}`, ctx.user?.id);
  await emitEvent(workspaceId, "LEAD_CREATED", { leadId: lead.id, email: lead.email, source, status, firstName: lead.firstName, company: lead.company });
  await notify({ workspaceId, type: "lead.created", title: `New lead: ${lead.firstName} ${lead.lastName ?? ""}`.trim(), body: lead.company ?? undefined, link: `/app/leads/${lead.id}`, permission: "leads:write" });
  return lead;
}

export async function updateLead(ctx: WorkspaceContext, id: string, input: Partial<LeadInput>) {
  const existing = await getLead(ctx.workspace.id, id);
  await assertRefs(ctx.workspace.id, input);
  const email = input.email !== undefined ? input.email?.toLowerCase().trim() || null : undefined;
  const lead = await db.lead.update({ where: { id }, data: { ...input, ...(email !== undefined ? { email } : {}) } });
  if (input.status && input.status !== existing.status) {
    await logActivity(ctx.workspace.id, id, "STATUS_CHANGE", `Status changed from ${existing.status} to ${input.status}`, ctx.user.id, { from: existing.status, to: input.status });
    await emitEvent(ctx.workspace.id, "LEAD_STATUS_CHANGED", { leadId: id, status: input.status, previousStatus: existing.status, email: lead.email, firstName: lead.firstName });
  }
  await recalcScore(id);
  return lead;
}

export async function deleteLeads(ctx: WorkspaceContext, ids: string[]) {
  const res = await db.lead.updateMany({ where: { id: { in: ids }, workspaceId: ctx.workspace.id, deletedAt: null }, data: { deletedAt: new Date() } });
  await audit({ action: "lead.deleted", workspaceId: ctx.workspace.id, actorId: ctx.user.id, metadata: { count: res.count } });
  return { deleted: res.count };
}

export async function bulkUpdate(ctx: WorkspaceContext, ids: string[], input: { status?: LeadStatus; addTag?: string; ownerId?: string }) {
  const leads = await db.lead.findMany({ where: { id: { in: ids }, workspaceId: ctx.workspace.id, deletedAt: null } });
  for (const l of leads) {
    await updateLead(ctx, l.id, {
      ...(input.status ? { status: input.status } : {}),
      ...(input.ownerId ? { ownerId: input.ownerId } : {}),
      ...(input.addTag ? { tags: [...new Set([...l.tags, input.addTag])] } : {}),
    });
  }
  return { updated: leads.length };
}

export async function addNote(ctx: WorkspaceContext, leadId: string, content: string, type: "NOTE" | "CALL" | "MEETING" = "NOTE") {
  await getLead(ctx.workspace.id, leadId);
  const activity = await logActivity(ctx.workspace.id, leadId, type, content, ctx.user.id);
  if (type !== "NOTE") await db.lead.update({ where: { id: leadId }, data: { lastContactedAt: new Date() } });
  await recalcScore(leadId);
  return activity;
}

export async function addLeadTask(ctx: WorkspaceContext, leadId: string, input: { title: string; dueDate?: Date | null }) {
  await getLead(ctx.workspace.id, leadId);
  const task = await db.leadTask.create({ data: { workspaceId: ctx.workspace.id, leadId, title: input.title, dueDate: input.dueDate, assigneeId: ctx.user.id } });
  await logActivity(ctx.workspace.id, leadId, "TASK", `Task created: ${input.title}`, ctx.user.id);
  return task;
}

export async function toggleLeadTask(ctx: WorkspaceContext, leadId: string, taskId: string, done: boolean) {
  const task = await db.leadTask.findFirst({ where: { id: taskId, leadId, workspaceId: ctx.workspace.id } });
  if (!task) throw notFound("Task");
  const updated = await db.leadTask.update({ where: { id: taskId }, data: { completedAt: done ? new Date() : null } });
  if (done) await logActivity(ctx.workspace.id, leadId, "TASK", `Task completed: ${task.title}`, ctx.user.id);
  return updated;
}

export async function deleteLeadTask(ctx: WorkspaceContext, leadId: string, taskId: string) {
  const task = await db.leadTask.findFirst({ where: { id: taskId, leadId, workspaceId: ctx.workspace.id } });
  if (!task) throw notFound("Task");
  await db.leadTask.delete({ where: { id: taskId } });
}

export async function pipeline(workspaceId: string) {
  const leads = await db.lead.findMany({
    where: { workspaceId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true, company: true, status: true, score: true, valueCents: true, updatedAt: true },
    orderBy: { score: "desc" },
    take: 600,
  });
  return LEAD_STATUSES.map((status) => {
    const items = leads.filter((l) => l.status === status);
    return { status, count: items.length, valueCents: items.reduce((a, l) => a + l.valueCents, 0), leads: items.slice(0, 50) };
  });
}

// ─── CSV ───

export const LEAD_CSV_COLUMNS = [
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "company", label: "Company" },
  { key: "jobTitle", label: "Job title" },
  { key: "website", label: "Website" },
  { key: "source", label: "Source" },
  { key: "status", label: "Status" },
  { key: "score", label: "Score" },
  { key: "tags", label: "Tags" },
  { key: "value", label: "Value" },
  { key: "createdAt", label: "Created at" },
] as const;

export async function exportLeads(workspaceId: string, filters: { status?: LeadStatus; source?: LeadSource }) {
  const leads = await db.lead.findMany({ where: { workspaceId, deletedAt: null, ...filters }, orderBy: { createdAt: "desc" }, take: 50_000 });
  return toCsv(
    leads.map((l) => ({ ...l, value: (l.valueCents / 100).toFixed(2) })),
    LEAD_CSV_COLUMNS.map((c) => ({ key: c.key as keyof (typeof leads)[number] & string, label: c.label })) as never,
  );
}

const pick = (row: Record<string, string>, ...keys: string[]) => keys.map((k) => row[k]).find((v) => v && v.trim()) ?? "";

export async function importLeads(ctx: WorkspaceContext, csv: string) {
  const rows = parseCsvObjects(csv);
  if (!rows.length) throw badRequest("The CSV file is empty");
  if (rows.length > 5000) throw badRequest("Import up to 5,000 rows at a time");
  const plan = getPlan(ctx.plan);
  const existingCount = await db.lead.count({ where: { workspaceId: ctx.workspace.id, deletedAt: null } });
  const existingEmails = new Set(
    (await db.lead.findMany({ where: { workspaceId: ctx.workspace.id }, select: { email: true } })).map((l) => l.email).filter(Boolean) as string[],
  );

  const errors: { row: number; message: string }[] = [];
  const toCreate: Prisma.LeadCreateManyInput[] = [];
  rows.forEach((row, i) => {
    const firstNameRaw = pick(row, "first_name", "firstname", "first", "name", "full_name");
    const [first, ...rest] = firstNameRaw.split(" ");
    const email = pick(row, "email", "email_address", "e_mail").toLowerCase();
    if (!first && !email) return errors.push({ row: i + 2, message: "Missing name and email" });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return errors.push({ row: i + 2, message: `Invalid email “${email}”` });
    if (email && existingEmails.has(email)) return errors.push({ row: i + 2, message: `Duplicate email ${email}` });
    if (email) existingEmails.add(email);
    const sourceRaw = pick(row, "source").toUpperCase();
    const statusRaw = pick(row, "status").toUpperCase();
    const source = (LEAD_SOURCES as readonly string[]).includes(sourceRaw) ? (sourceRaw as LeadSource) : "IMPORT";
    const status = (LEAD_STATUSES as readonly string[]).includes(statusRaw) ? (statusRaw as LeadStatus) : "NEW";
    const data = {
      firstName: first || email.split("@")[0]!,
      lastName: pick(row, "last_name", "lastname", "last", "surname") || rest.join(" ") || null,
      email: email || null,
      phone: pick(row, "phone", "phone_number", "mobile") || null,
      company: pick(row, "company", "company_name", "organization") || null,
      jobTitle: pick(row, "job_title", "title", "position", "role") || null,
      website: pick(row, "website", "url", "domain") || null,
      source,
      status,
      tags: pick(row, "tags").split(/[;,]/).map((t) => t.trim()).filter(Boolean),
      valueCents: Math.round(parseFloat(pick(row, "value", "deal_value") || "0") * 100) || 0,
    };
    toCreate.push({ ...data, workspaceId: ctx.workspace.id, ownerId: ctx.user.id, score: scoreLead(data) });
  });

  if (!withinLimit(plan.limits.contacts, existingCount, toCreate.length)) {
    throw paymentRequired(`Importing ${toCreate.length} leads would exceed your plan's ${plan.limits.contacts.toLocaleString()} contact limit.`);
  }
  const created = await db.lead.createMany({ data: toCreate, skipDuplicates: true });
  const createdLeads = await db.lead.findMany({ where: { workspaceId: ctx.workspace.id, email: { in: toCreate.map((l) => l.email).filter(Boolean) as string[] } }, select: { id: true } });
  if (createdLeads.length) {
    await db.leadActivity.createMany({ data: createdLeads.map((l) => ({ workspaceId: ctx.workspace.id, leadId: l.id, type: "IMPORTED" as const, content: "Imported from CSV", actorId: ctx.user.id })) });
  }
  await audit({ action: "lead.imported", workspaceId: ctx.workspace.id, actorId: ctx.user.id, metadata: { created: created.count, errors: errors.length } });
  return { created: created.count, skipped: errors.length, errors: errors.slice(0, 50) };
}
