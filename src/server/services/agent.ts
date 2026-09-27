import type { AgentConfig, Prisma } from "@prisma/client";
import { db } from "../db";
import { badRequest, notFound } from "../errors";
import { audit } from "../audit";
import { logger } from "../logger";
import { generateText } from "../ai/service";
import { resolveModel } from "../ai/registry";
import type { WorkspaceContext } from "../tenant";
import { actionSchema, copilotExecute, describe, type CopilotAction } from "./copilot";
import { workspaceInsights, type Insight } from "./insights";
import { notify } from "./notifications";

/**
 * AI Manager: a daily agent that reviews the workspace, writes a morning brief and proposes
 * concrete actions. Nothing is published or sent without a person approving it; with
 * `autoDrafts` on, draft-only actions (content and social drafts) are prepared in advance.
 */

const DAY = 86_400_000;
const DRAFT_ONLY = new Set<CopilotAction["type"]>(["create_content", "draft_social_posts"]);
const MAX_PROPOSALS = 6;

export type Candidate = { action: CopilotAction; reason: string; title?: string; description?: string };

export async function getConfig(workspaceId: string): Promise<AgentConfig> {
  return db.agentConfig.upsert({ where: { workspaceId }, update: {}, create: { workspaceId } });
}

export async function updateConfig(ctx: WorkspaceContext, input: Partial<Pick<AgentConfig, "enabled" | "runHourUtc" | "autoDrafts" | "focus">>) {
  await getConfig(ctx.workspace.id);
  const config = await db.agentConfig.update({ where: { workspaceId: ctx.workspace.id }, data: input });
  await audit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: "agent.config_updated", metadata: input as Prisma.InputJsonValue });
  return config;
}

// ─── Deciding what to propose ───

/** Rule-based proposals from live workspace data. Pure apart from the reads it is given. */
export function ruleCandidates(input: {
  insights: Insight[];
  company: string;
  topic: string;
  focus: string | null;
  unreadInbox: number;
  hotLeads: { id: string; firstName: string; lastName: string | null; company: string | null }[];
  daysSinceBlog: number | null;
  pages: number;
  websiteInstalled: boolean;
  platforms: ("LINKEDIN" | "INSTAGRAM" | "X" | "FACEBOOK")[];
}): Candidate[] {
  const out: Candidate[] = [];
  const has = (id: string) => input.insights.some((i) => i.id === id || i.id.startsWith(id));
  const topic = input.focus?.trim() || input.topic;

  if (input.unreadInbox) out.push({ action: { type: "navigate", href: "/app/inbox", label: "Inbox" }, title: `Reply to ${input.unreadInbox} unread conversation${input.unreadInbox === 1 ? "" : "s"}`, description: "Customers are waiting. AI can draft each reply for you.", reason: "Fast replies convert far better than replies after a day." });
  for (const l of input.hotLeads.slice(0, 2)) {
    const name = [l.firstName, l.lastName].filter(Boolean).join(" ");
    out.push({ action: { type: "create_content", kind: "email", topic: `A short, personal follow-up email to ${name}${l.company ? ` at ${l.company}` : ""}, a hot lead we haven't contacted recently. Suggest a quick call.` }, title: `Draft a follow-up email to ${name}`, description: `A short, personal email${l.company ? ` for ${l.company}` : ""} suggesting a quick call. Saved to Content Studio as a draft — you review and send it.`, reason: `${name} scores 70+ and hasn't been contacted in 3+ days.` });
  }
  if (has("empty-calendar")) out.push({ action: { type: "draft_social_posts", topic, platforms: input.platforms.length ? input.platforms.slice(0, 2) : ["LINKEDIN"], count: 3 }, reason: "Nothing is scheduled for the next 7 days — consistent posting keeps reach up." });
  if (input.daysSinceBlog === null || input.daysSinceBlog >= 14) out.push({ action: { type: "create_content", kind: "blog", topic: `${topic} — a practical guide for our audience` }, reason: input.daysSinceBlog === null ? "You haven't published a blog post yet — articles compound search traffic." : `The last blog post was ${input.daysSinceBlog} days ago.` });
  if (has("anomaly-visits") || has("wow-visits")) {
    const drop = input.insights.find((i) => (i.id === "anomaly-visits" || i.id === "wow-visits") && i.severity !== "good");
    if (drop) out.push({ action: { type: "create_content", kind: "seo-meta", topic: `${input.company} homepage and key pages` }, title: "Refresh SEO titles and descriptions", reason: `${drop.title}. Better search snippets are the quickest fix.` });
  }
  for (const i of input.insights.filter((x) => x.id.startsWith("email-")).slice(0, 1)) out.push({ action: { type: "create_content", kind: "email", topic: `A re-engagement email with 5 subject line options, after low opens on a recent send (${i.title})` }, reason: i.title });
  if (has("approvals")) {
    const a = input.insights.find((i) => i.id === "approvals")!;
    out.push({ action: { type: "navigate", href: a.action?.href.startsWith("/app") ? a.action.href : "/app/workers?tab=approvals", label: "Approvals" }, title: a.title, description: a.detail, reason: "Work is done and only waiting on a decision." });
  }
  if (!input.websiteInstalled) out.push({ action: { type: "navigate", href: "/app/website", label: "Website" }, title: "Install the website snippet", description: "Track real visitors, chat with them using AI and turn forms into leads.", reason: "No website traffic has been recorded yet." });
  else if (!input.pages) out.push({ action: { type: "navigate", href: "/app/pages", label: "Landing pages" }, title: "Create a landing page for your main offer", description: "AI writes it in seconds; share the link in ads, emails and posts.", reason: "A focused page with one form usually converts better than a homepage." });
  for (const i of input.insights.filter((x) => x.severity === "critical" && x.action?.href.startsWith("/app")).slice(0, 2)) out.push({ action: { type: "navigate", href: i.action!.href, label: i.action!.label }, title: i.title, description: i.detail, reason: "Critical signal from today's review." });
  return out;
}

async function gather(workspaceId: string, config: AgentConfig) {
  const now = Date.now();
  const [insights, kit, ws, unreadInbox, hotLeads, lastBlog, pages, siteEvent, accounts] = await Promise.all([
    workspaceInsights(workspaceId),
    db.brandKit.findUnique({ where: { workspaceId }, select: { companyName: true, productsServices: true, usps: true, targetAudience: true } }),
    db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { name: true } }),
    db.conversation.count({ where: { workspaceId, status: "OPEN", unread: { gt: 0 } } }),
    db.lead.findMany({ where: { workspaceId, deletedAt: null, score: { gte: 70 }, status: { in: ["NEW", "CONTACTED", "QUALIFIED"] }, OR: [{ lastContactedAt: null }, { lastContactedAt: { lt: new Date(now - 3 * DAY) } }] }, orderBy: { score: "desc" }, take: 3, select: { id: true, firstName: true, lastName: true, company: true } }),
    db.content.findFirst({ where: { workspaceId, deletedAt: null, type: "BLOG_POST" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    db.landingPage.count({ where: { workspaceId } }),
    db.siteEvent.findFirst({ where: { workspaceId }, select: { id: true } }),
    db.socialAccount.findMany({ where: { workspaceId }, select: { platform: true }, distinct: ["platform"] }),
  ]);
  const company = kit?.companyName ?? ws.name;
  const topic = kit?.usps[0] || kit?.productsServices?.split(/[.\n]/)[0]?.trim() || `how ${company} helps ${kit?.targetAudience ?? "customers"}`;
  const platforms = accounts.map((a) => a.platform).filter((p): p is "LINKEDIN" | "INSTAGRAM" | "X" | "FACEBOOK" => ["LINKEDIN", "INSTAGRAM", "X", "FACEBOOK"].includes(p));
  return {
    insights,
    company,
    topic: topic.slice(0, 200),
    focus: config.focus,
    unreadInbox,
    hotLeads,
    daysSinceBlog: lastBlog ? Math.floor((now - lastBlog.createdAt.getTime()) / DAY) : null,
    pages,
    websiteInstalled: !!siteEvent,
    platforms,
  };
}

function templateBrief(company: string, insights: Insight[], candidates: Candidate[]): string {
  const good = insights.filter((i) => i.severity === "good").slice(0, 2);
  const issues = insights.filter((i) => i.severity === "critical" || i.severity === "warning").slice(0, 3);
  const lines = [`Good morning. Here's today's plan for ${company}.`];
  if (good.length) lines.push(`What's working: ${good.map((i) => i.title.toLowerCase()).join("; ")}.`);
  if (issues.length) lines.push(`Needs attention: ${issues.map((i) => i.title).join("; ")}.`);
  if (!good.length && !issues.length) lines.push("No unusual changes in traffic, leads or conversions since yesterday.");
  lines.push(candidates.length ? `I've lined up ${candidates.length} action${candidates.length === 1 ? "" : "s"} below — approve the ones you want and I'll do the work.` : "Nothing needs your approval today.");
  return lines.join("\n\n");
}

/** Real model: a written brief plus up to two extra ideas as structured actions. */
async function llmBrief(workspaceId: string, data: Awaited<ReturnType<typeof gather>>, candidates: Candidate[]): Promise<{ brief: string; extra: Candidate[] } | null> {
  const r = await generateText({
    workspaceId,
    feature: "agent:brief",
    maxTokens: 1500,
    system: `You are the AI marketing manager for ${data.company}. Every morning you brief the team in plain, confident language. Use only the data given — never invent numbers.
Reply with ONLY JSON: {"brief":"<3 short paragraphs: what happened, what matters today, what you've lined up>","extra":[{"reason":"<why>","action":<action>}]}
"extra" holds at most 2 NEW ideas not already in the planned list. Allowed actions:
{"type":"create_content","kind":"blog|ad|landing|email|product|seo-meta","topic":"<topic>"}
{"type":"draft_social_posts","topic":"<topic>","platforms":["LINKEDIN"|"INSTAGRAM"|"X"|"FACEBOOK"],"count":1-5}`,
    messages: [
      {
        role: "user",
        content: `Focus set by the team: ${data.focus || "(none)"}
Signals:
${data.insights.map((i) => `- [${i.severity}] ${i.title} — ${i.detail}`).join("\n") || "- none"}
Unread inbox conversations: ${data.unreadInbox}
Hot leads waiting: ${data.hotLeads.length}
Days since last blog post: ${data.daysSinceBlog ?? "never"}
Planned actions:
${candidates.map((c) => `- ${c.title ?? describe(c.action).title} (${c.reason})`).join("\n") || "- none"}`,
      },
    ],
  });
  const json = r.text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as { brief?: unknown; extra?: unknown };
    if (typeof parsed.brief !== "string" || !parsed.brief.trim()) return null;
    const extra = (Array.isArray(parsed.extra) ? parsed.extra : [])
      .slice(0, 2)
      .map((e: { reason?: unknown; action?: unknown }) => ({ reason: typeof e.reason === "string" ? e.reason.slice(0, 300) : "Suggested by the AI Manager", parsed: actionSchema.safeParse(e.action) }))
      .filter((e) => e.parsed.success && DRAFT_ONLY.has(e.parsed.data.type))
      .map((e) => ({ action: e.parsed.data!, reason: e.reason }));
    return { brief: parsed.brief.trim().slice(0, 4000), extra };
  } catch {
    return null;
  }
}

/** The member the agent acts as for automatic drafts: the longest-standing owner. */
async function ownerContext(workspaceId: string): Promise<WorkspaceContext | null> {
  const m = await db.workspaceMember.findFirst({
    where: { workspaceId, role: { key: "owner" }, user: { status: "ACTIVE" } },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { id: true, email: true, name: true, avatarUrl: true, platformRole: true, emailVerifiedAt: true, twoFactorEnabled: true, lastWorkspaceId: true, status: true } },
      role: { select: { id: true, key: true, name: true, rank: true, permissions: true } },
      workspace: { select: { id: true, name: true, slug: true, logoUrl: true, timezone: true, subscription: { select: { plan: true } } } },
    },
  });
  if (!m) return null;
  const { subscription, ...workspace } = m.workspace;
  return { user: m.user, workspace, role: m.role, plan: subscription?.plan ?? "FREE" };
}

// ─── Running ───

export async function runAgent(workspaceId: string, trigger: "schedule" | "manual", actor?: WorkspaceContext) {
  const config = await getConfig(workspaceId);
  const running = await db.agentRun.findFirst({ where: { workspaceId, status: "RUNNING", startedAt: { gt: new Date(Date.now() - 15 * 60_000) } }, select: { id: true } });
  if (running) throw badRequest("The AI Manager is already working — check back in a minute");
  const run = await db.agentRun.create({ data: { workspaceId, trigger } });
  await db.agentConfig.update({ where: { workspaceId }, data: { lastRunAt: new Date() } });

  try {
    // Week-old suggestions nobody acted on are stale.
    await db.agentProposal.updateMany({ where: { workspaceId, status: "PENDING", createdAt: { lt: new Date(Date.now() - 7 * DAY) } }, data: { status: "DISMISSED", resultMessage: "Expired" } });
    const data = await gather(workspaceId, config);
    let candidates = ruleCandidates(data);

    let brief: string | null = null;
    if ((await resolveModel(null)).provider !== "local") {
      try {
        const llm = await llmBrief(workspaceId, data, candidates);
        if (llm) {
          brief = llm.brief;
          candidates = [...candidates, ...llm.extra];
        }
      } catch (err) {
        logger.warn("AI Manager brief failed; using the template", { err, workspaceId });
      }
    }

    // Skip anything already waiting for a decision.
    const pending = new Set((await db.agentProposal.findMany({ where: { workspaceId, status: "PENDING" }, select: { title: true } })).map((p) => p.title));
    const fresh = candidates
      .map((c) => ({ ...c, title: (c.title ?? describe(c.action).title).slice(0, 200), description: (c.description ?? describe(c.action).description).slice(0, 1000) }))
      .filter((c, i, all) => !pending.has(c.title) && all.findIndex((x) => x.title === c.title) === i)
      .slice(0, MAX_PROPOSALS);
    brief ??= templateBrief(data.company, data.insights, fresh);

    const created = [];
    for (const c of fresh) created.push(await db.agentProposal.create({ data: { workspaceId, runId: run.id, title: c.title, description: c.description, reason: c.reason.slice(0, 500), action: c.action as Prisma.InputJsonValue } }));

    let drafted = 0;
    if (config.autoDrafts) {
      const as = actor ?? (await ownerContext(workspaceId));
      for (const p of created.filter((p) => DRAFT_ONLY.has((p.action as CopilotAction).type)).slice(0, 3)) {
        if (!as) break;
        const r = await decide(as, p.id, "approve").catch((err) => {
          logger.warn("AI Manager auto-draft failed", { err, proposalId: p.id });
          return null;
        });
        if (r?.status === "DONE") drafted++;
      }
    }

    const summary = drafted ? `${brief}\n\nI've already prepared ${drafted} draft${drafted === 1 ? "" : "s"} for review — nothing has been published or sent.` : brief;
    const done = await db.agentRun.update({ where: { id: run.id }, data: { status: "COMPLETED", summary, finishedAt: new Date() } });
    await notify({ workspaceId, type: "agent.brief", title: created.length ? `Your AI Manager has ${created.length} suggestion${created.length === 1 ? "" : "s"} for today` : "Your daily AI brief is ready", body: summary.split("\n")[0]?.slice(0, 200), link: "/app/agent", permission: "campaigns:read" });
    return done;
  } catch (err) {
    logger.error("AI Manager run failed", { err, workspaceId });
    await db.agentRun.update({ where: { id: run.id }, data: { status: "FAILED", error: err instanceof Error ? err.message.slice(0, 500) : "Run failed", finishedAt: new Date() } });
    throw err;
  }
}

/** Approve (run the action as the approving member) or dismiss a proposal. */
export async function decide(ctx: WorkspaceContext, id: string, decision: "approve" | "dismiss") {
  const p = await db.agentProposal.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!p) throw notFound("Suggestion");
  if (p.status !== "PENDING" && p.status !== "FAILED") throw badRequest("This suggestion was already handled");
  const decided = { decidedById: ctx.user.id, decidedAt: new Date() };
  if (decision === "dismiss") return db.agentProposal.update({ where: { id }, data: { status: "DISMISSED", ...decided } });

  const action = actionSchema.parse(p.action);
  // Claim it first so a double click can't run it twice.
  const claimed = await db.agentProposal.updateMany({ where: { id, status: p.status }, data: { status: "DONE", ...decided } });
  if (!claimed.count) throw badRequest("This suggestion was already handled");
  try {
    const r = await copilotExecute(ctx, action);
    await audit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: "agent.proposal_approved", entityType: "AgentProposal", entityId: id });
    return db.agentProposal.update({ where: { id }, data: { resultMessage: r.message.slice(0, 1000), resultHref: r.href ?? null } });
  } catch (err) {
    await db.agentProposal.update({ where: { id }, data: { status: "FAILED", resultMessage: err instanceof Error ? err.message.slice(0, 500) : "Failed" } });
    throw err;
  }
}

export async function agentOverview(workspaceId: string) {
  const [config, runs, pending, recent] = await Promise.all([
    getConfig(workspaceId),
    db.agentRun.findMany({ where: { workspaceId }, orderBy: { startedAt: "desc" }, take: 10 }),
    db.agentProposal.findMany({ where: { workspaceId, status: { in: ["PENDING", "FAILED"] } }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.agentProposal.findMany({ where: { workspaceId, status: { in: ["DONE", "DISMISSED"] } }, orderBy: { decidedAt: "desc" }, take: 15 }),
  ]);
  return { config, latest: runs[0] ?? null, runs, pending, recent };
}

/** Called from the scheduler tick: queues each enabled workspace once per day, from its hour on. */
export async function runDueAgents(now = new Date()) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const due = await db.agentConfig.findMany({
    where: { enabled: true, runHourUtc: { lte: now.getUTCHours() }, OR: [{ lastRunAt: null }, { lastRunAt: { lt: today } }], workspace: { deletedAt: null } },
    select: { workspaceId: true },
    take: 50,
  });
  // Mark before queueing so the next tick doesn't queue the same workspace again.
  const { enqueue } = await import("../queue");
  for (const c of due) {
    await db.agentConfig.update({ where: { workspaceId: c.workspaceId }, data: { lastRunAt: now } });
    await enqueue("reports", { kind: "agent-run", workspaceId: c.workspaceId });
  }
  return due.length;
}
