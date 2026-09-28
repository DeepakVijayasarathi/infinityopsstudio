import { z } from "zod";
import type { SocialPlatform } from "@prisma/client";
import { db } from "../db";
import { audit } from "../audit";
import { logger } from "../logger";
import { forbidden, notFound } from "../errors";
import { generateText } from "../ai/service";
import { resolveModel } from "../ai/registry";
import { buildGeneratorPrompt, GENERATORS, type GeneratorKey } from "../ai/prompts";
import { can, type WorkspaceContext } from "../tenant";
import { overview, resolveRange } from "./analytics";
import { nextBestActions, workspaceInsights } from "./insights";
import { createCampaign } from "./campaigns";
import { createContent } from "./content";
import { createPost } from "./social";
import { createLead } from "./leads";
import { createTask } from "./workers";
import { splitPosts } from "./autopilot";
import { PLATFORM_LABELS, PLATFORM_LIMITS } from "@/lib/constants";
import { getWorkerTemplate, WORKER_TEMPLATES } from "@/config/workers";
import type { Permission } from "@/config/permissions";

/**
 * Workspace Copilot. Questions about the workspace are answered from live data; requests to do
 * something come back as proposed actions that the user approves before anything is created.
 * With a real AI model the model plans the reply and actions (validated against a schema);
 * with the offline demo provider a rule-based planner understands common requests.
 */

const PLATFORMS = ["LINKEDIN", "INSTAGRAM", "X", "FACEBOOK"] as const;
const CONTENT_KINDS = ["blog", "ad", "landing", "email", "product", "seo-meta"] as const;

export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("launch_ai_campaign"), goal: z.string().min(10).max(500) }),
  z.object({ type: z.literal("create_campaign"), name: z.string().min(2).max(120), description: z.string().max(1000).optional() }),
  z.object({ type: z.literal("create_content"), kind: z.enum(CONTENT_KINDS), topic: z.string().min(3).max(500) }),
  z.object({ type: z.literal("draft_social_posts"), topic: z.string().min(3).max(500), platforms: z.array(z.enum(PLATFORMS)).min(1).max(4), count: z.coerce.number().int().min(1).max(5).default(3) }),
  z.object({ type: z.literal("create_lead"), firstName: z.string().min(1).max(80), lastName: z.string().max(80).optional(), email: z.string().email().optional(), company: z.string().max(120).optional() }),
  z.object({ type: z.literal("assign_worker_task"), workerKey: z.string().min(2).max(60), instructions: z.string().min(5).max(2000) }),
  z.object({ type: z.literal("navigate"), href: z.string().regex(/^\/app(\/[\w\-/?=&]*)?$/), label: z.string().max(60) }),
]);
export type CopilotAction = z.infer<typeof actionSchema>;

export type ProposedAction = { id: string; title: string; description: string; action: CopilotAction };
export type CopilotReply = { reply: string; actions: ProposedAction[]; suggestions?: string[] };
export type ChatTurn = { role: "user" | "assistant"; content: string };

const PERMISSION: Record<CopilotAction["type"], Permission | null> = {
  launch_ai_campaign: "campaigns:write",
  create_campaign: "campaigns:write",
  create_content: "content:write",
  draft_social_posts: "social:write",
  create_lead: "leads:write",
  assign_worker_task: "workers:run",
  navigate: null,
};

const WORKER_ALIASES: Record<string, string> = Object.fromEntries(WORKER_TEMPLATES.map((w) => [w.name.toLowerCase(), w.key]));

// ─── Describing actions ───

export function describe(a: CopilotAction): { title: string; description: string } {
  switch (a.type) {
    case "launch_ai_campaign":
      return { title: "Build a full campaign with AI", description: `Strategy, tasks, content, social drafts, email and automation for: “${a.goal}”` };
    case "create_campaign":
      return { title: `Create campaign “${a.name}”`, description: "An empty draft campaign you can plan yourself." };
    case "create_content":
      return { title: `Write a ${GENERATORS[a.kind as GeneratorKey].label.toLowerCase()}`, description: `About: ${a.topic}. Saved to Content Studio as a draft.` };
    case "draft_social_posts":
      return { title: `Draft ${a.count} post${a.count > 1 ? "s" : ""} for ${a.platforms.map((p) => PLATFORM_LABELS[p]).join(", ")}`, description: `About: ${a.topic}. Saved as drafts for review.` };
    case "create_lead":
      return { title: `Add lead ${[a.firstName, a.lastName].filter(Boolean).join(" ")}`, description: [a.email, a.company].filter(Boolean).join(" · ") || "Contact details can be added later." };
    case "assign_worker_task": {
      const w = getWorkerTemplate(a.workerKey);
      return { title: `Ask ${w?.name ?? "an AI worker"} (${w?.title ?? a.workerKey})`, description: a.instructions };
    }
    case "navigate":
      return { title: `Open ${a.label}`, description: a.href };
  }
}

function propose(ctx: WorkspaceContext, actions: CopilotAction[]): ProposedAction[] {
  return actions
    .filter((a) => {
      const perm = PERMISSION[a.type];
      return !perm || can(ctx, perm);
    })
    .map((a, i) => ({ id: `a${Date.now().toString(36)}${i}`, action: a, ...describe(a) }));
}

// ─── Workspace data answers ───

const fmt = (n: number) => n.toLocaleString("en-US");
const change = (cur: number, prev: number) => (prev > 0 ? ` (${cur >= prev ? "+" : ""}${Math.round(((cur - prev) / prev) * 100)}% vs previous)` : "");

async function performanceAnswer(ws: string, days: number): Promise<string> {
  const [o, insights] = await Promise.all([overview(ws, resolveRange({ days })), workspaceInsights(ws)]);
  const k = o.kpis;
  const lines = [
    `**Last ${days} days**`,
    "",
    `| Metric | Value |`,
    `|---|---|`,
    `| Leads | ${fmt(k.leadsGenerated.value)}${change(k.leadsGenerated.value, k.leadsGenerated.previous)} |`,
    `| Social reach | ${fmt(k.socialReach.value)}${change(k.socialReach.value, k.socialReach.previous)} |`,
    `| Engagement | ${fmt(k.engagement.value)}${change(k.engagement.value, k.engagement.previous)} |`,
    `| Conversion rate | ${(k.conversionRate.value * 100).toFixed(2)}% |`,
    `| Active campaigns | ${k.activeCampaigns.value} |`,
  ];
  const top = insights.slice(0, 3);
  if (top.length) lines.push("", "**What stands out**", ...top.map((i) => `- ${i.title} — ${i.detail}`));
  return lines.join("\n");
}

async function hotLeadsAnswer(ws: string): Promise<string> {
  const leads = await db.lead.findMany({
    where: { workspaceId: ws, deletedAt: null, status: { in: ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL"] } },
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
    take: 5,
    select: { id: true, firstName: true, lastName: true, company: true, score: true, status: true, lastContactedAt: true },
  });
  if (!leads.length) return "You don't have any open leads yet. Add one or import a CSV from the Leads page.";
  const rows = leads.map((l) => {
    const days = l.lastContactedAt ? `${Math.floor((Date.now() - l.lastContactedAt.getTime()) / 86_400_000)}d ago` : "never";
    return `| [${[l.firstName, l.lastName].filter(Boolean).join(" ")}](/app/leads/${l.id}) | ${l.company ?? "—"} | ${l.score} | ${l.status.toLowerCase()} | ${days} |`;
  });
  return ["**Your hottest open leads** — start at the top:", "", "| Lead | Company | Score | Stage | Last contact |", "|---|---|---|---|---|", ...rows].join("\n");
}

async function approvalsAnswer(ws: string): Promise<string> {
  const [tasks, posts, campaigns, content] = await Promise.all([
    db.aITask.count({ where: { workspaceId: ws, status: "AWAITING_APPROVAL" } }),
    db.socialPost.count({ where: { workspaceId: ws, status: "PENDING_APPROVAL" } }),
    db.campaign.count({ where: { workspaceId: ws, approvalStatus: "PENDING", deletedAt: null } }),
    db.content.count({ where: { workspaceId: ws, status: "IN_REVIEW", deletedAt: null } }),
  ]);
  if (!tasks && !posts && !campaigns && !content) return "Nothing is waiting on you right now. 🎉";
  return [
    "**Waiting for your review:**",
    tasks ? `- [${tasks} AI output${tasks > 1 ? "s" : ""}](/app/workers?tab=approvals)` : "",
    posts ? `- [${posts} social post${posts > 1 ? "s" : ""}](/app/social?tab=approvals)` : "",
    campaigns ? `- [${campaigns} campaign${campaigns > 1 ? "s" : ""}](/app/campaigns?approval=PENDING)` : "",
    content ? `- [${content} content item${content > 1 ? "s" : ""}](/app/content?status=IN_REVIEW)` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function nextStepsAnswer(ws: string): Promise<string> {
  const actions = nextBestActions(await workspaceInsights(ws));
  if (!actions.length) return "Things look healthy. A good next step: plan next month's content with **“Build a campaign for …”**.";
  return ["**Here's what I'd do next:**", "", ...actions.map((a, i) => `${i + 1}. **${a.title}** — ${a.detail} [${a.action!.label} →](${a.action!.href})`)].join("\n");
}

async function upcomingAnswer(ws: string): Promise<string> {
  const posts = await db.socialPost.findMany({ where: { workspaceId: ws, scheduledAt: { gte: new Date() }, status: { in: ["SCHEDULED", "PENDING_APPROVAL", "DRAFT"] } }, orderBy: { scheduledAt: "asc" }, take: 6, select: { platform: true, text: true, scheduledAt: true, status: true } });
  if (!posts.length) return "Nothing is scheduled. Want me to draft a week of posts?";
  return ["**Coming up on your calendar:**", ...posts.map((p) => `- ${p.scheduledAt!.toUTCString().slice(0, 16)} · ${PLATFORM_LABELS[p.platform]} · ${p.status === "SCHEDULED" ? "scheduled" : p.status.toLowerCase().replace("_", " ")} — “${p.text.slice(0, 70).replace(/\s+/g, " ")}…”`), "", "[Open the calendar →](/app/social)"].join("\n");
}

async function campaignsAnswer(ws: string): Promise<string> {
  const list = await db.campaign.findMany({ where: { workspaceId: ws, deletedAt: null, status: { in: ["ACTIVE", "PLANNING", "DRAFT", "PAUSED"] } }, orderBy: { updatedAt: "desc" }, take: 6, select: { id: true, name: true, status: true, budgetCents: true, spentCents: true } });
  if (!list.length) return "No open campaigns. Tell me a goal and I'll build one.";
  return ["**Your campaigns:**", ...list.map((c) => `- [${c.name}](/app/campaigns/${c.id}) — ${c.status.toLowerCase()}${c.budgetCents ? ` · $${fmt(Math.round(c.spentCents / 100))} of $${fmt(Math.round(c.budgetCents / 100))} spent` : ""}`)].join("\n");
}

const HELP = `I'm your marketing Copilot. I can **answer questions about your workspace** and **do work for you** — you approve anything before it's created.

Try:
- “How are we doing this month?”
- “Which leads should I call today?”
- “What needs my approval?”
- “Build a campaign to get 100 demo bookings in 4 weeks”
- “Draft 3 LinkedIn posts about our new feature”
- “Write a blog post about reducing delivery costs”
- “Add lead Priya Shah priya@acme.com from Acme”
- “Ask Atlas for keyword ideas for route optimization”`;

export const SUGGESTIONS = ["How are we doing this month?", "Which leads should I call today?", "What needs my approval?", "Build a campaign to get 100 demo bookings in 4 weeks", "Draft 3 LinkedIn posts about our new feature"];

// ─── Rule-based planner (offline demo AI) ───

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };

function platformsIn(m: string): (typeof PLATFORMS)[number][] {
  const out: (typeof PLATFORMS)[number][] = [];
  if (/linked\s?in/.test(m)) out.push("LINKEDIN");
  if (/insta(gram)?|\big\b/.test(m)) out.push("INSTAGRAM");
  if (/twitter|tweets?|\bx\b/.test(m)) out.push("X");
  if (/facebook|\bfb\b/.test(m)) out.push("FACEBOOK");
  return out;
}

function topicOf(message: string): string {
  const about = message.match(/\b(?:about|on|for|regarding|promoting|announcing)\s+(.{3,})$/i)?.[1];
  return (about ?? message).replace(/[.?!]+$/, "").trim().slice(0, 300);
}

export async function rulePlan(ctx: WorkspaceContext, message: string): Promise<CopilotReply> {
  const ws = ctx.workspace.id;
  const m = message.toLowerCase().trim();
  const creating = /\b(create|make|write|draft|build|generate|plan|launch|start|set ?up|add|prepare|compose)\b/.test(m);

  if (/^(hi|hello|hey|help|what can you do|how do (i|you) (use|work))\b/.test(m) || m.length < 3) return { reply: HELP, actions: [], suggestions: SUGGESTIONS };

  // Workspace questions — answered from live data.
  if (!creating) {
    if (/(hot|best|top|warm|priority)\s+leads?|who should i (call|contact|email|follow)|\b(which|what)\b[^.?]*\bleads?\b[^.?]*\b(call|contact|email|follow|chase)/.test(m)) return { reply: await hotLeadsAnswer(ws), actions: [] };
    if (/approv|waiting (on|for) me|needs? (my )?(review|attention)|pending/.test(m)) return { reply: await approvalsAnswer(ws), actions: [] };
    if (/what should (i|we)|next (step|best|action)|recommend|suggestions?|priorit|insights?|focus on/.test(m)) return { reply: await nextStepsAnswer(ws), actions: [] };
    if (/scheduled|upcoming|calendar|next posts?/.test(m)) return { reply: await upcomingAnswer(ws), actions: [] };
    if (/(my|active|running|open|current) campaigns?|campaign status|list campaigns/.test(m)) return { reply: await campaignsAnswer(ws), actions: [] };
    if (/how (are|is|did) (we|it|things|our|my)|performance|stats|kpis?|metrics|numbers|results|traffic|this (week|month)|doing/.test(m)) {
      const days = /week/.test(m) ? 7 : /quarter|90/.test(m) ? 90 : 30;
      return { reply: await performanceAnswer(ws, days), actions: [{ id: "nav", title: "Open analytics", description: "/app/analytics", action: { type: "navigate", href: "/app/analytics", label: "Analytics" } }] };
    }
  }

  // Requests to do something — proposed actions.
  const worker = m.match(/\b(ask|assign|tell|have|get)\s+(nova|quill|pulse|atlas|echo|blaze|lens|apex)\b/);
  if (worker) {
    const instructions = message.replace(/^.*?\b(?:ask|assign|tell|have|get)\s+\w+\s*(?:to|for)?\s*/i, "").trim() || message;
    return { reply: `I'll hand this to ${worker[2]![0]!.toUpperCase()}${worker[2]!.slice(1)}. Approve to start the task:`, actions: propose(ctx, [{ type: "assign_worker_task", workerKey: WORKER_ALIASES[worker[2]!]!, instructions }]) };
  }

  if (/\blead\b/.test(m) && /\b(add|new|create|save)\b/.test(m)) {
    const email = message.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0];
    const nameMatch = message.match(/\blead\s+(?:named\s+|called\s+)?([A-Z][\w'-]*)(?:\s+([A-Z][\w'-]*))?/);
    const company = message.match(/\b(?:from|at|of)\s+([A-Z][\w&.' -]{1,60}?)(?:\s*[,.]|$)/)?.[1]?.trim();
    const firstName = nameMatch?.[1] ?? email?.split("@")[0]?.split(/[._]/)[0]?.replace(/^\w/, (c) => c.toUpperCase()) ?? "New lead";
    return { reply: "Here's the lead I'll add:", actions: propose(ctx, [{ type: "create_lead", firstName, lastName: nameMatch?.[2], email, company }]) };
  }

  if (/\bcampaign\b/.test(m) && creating) {
    const named = message.match(/\b(?:called|named)\s+["“]?([^"”]{2,120})["”]?/i)?.[1];
    if (named) return { reply: "I'll set up the campaign:", actions: propose(ctx, [{ type: "create_campaign", name: named.trim() }]) };
    const goal = message.replace(/^\s*(please\s+)?(create|make|build|plan|launch|start|set ?up|prepare)\s+(me\s+)?(a|an|the)?\s*(new\s+)?(ai\s+)?campaign\s*(to|for|that|about|:)?\s*/i, "").trim();
    const full = goal.length >= 10 ? goal : message;
    return {
      reply: "I can build the whole campaign — strategy, tasks, a blog post, social drafts, an email and a follow-up automation. Everything stays a draft until you approve it.",
      actions: propose(ctx, [{ type: "launch_ai_campaign", goal: full.slice(0, 500) }, { type: "create_campaign", name: full.replace(/[.?!]+$/, "").slice(0, 80) }]),
    };
  }

  // Named content types first: "write a blog post" is content, not a social post.
  const kind = /\bblog|article\b/.test(m) ? "blog" : /\bland(ing)? page\b/.test(m) ? "landing" : /\bnewsletter|e-?mail\b/.test(m) ? "email" : /\bad(s| copy)?\b/.test(m) ? "ad" : /\bproduct description\b/.test(m) ? "product" : /\bmeta (title|description)|seo meta\b/.test(m) ? "seo-meta" : null;
  if (kind && creating) return { reply: "I'll write it and save it to Content Studio as a draft:", actions: propose(ctx, [{ type: "create_content", kind, topic: topicOf(message) }]) };

  const platforms = platformsIn(m);
  if (platforms.length || /\b(social|posts?|captions?|tweets?)\b/.test(m)) {
    // The first number before "posts" in the same sentence, e.g. "2 LinkedIn and Instagram posts".
    const countWord = m.match(/\b(\d+|one|two|three|four|five)\b(?=[^.?!]*\b(?:posts?|tweets?|captions?)\b)/)?.[1];
    const count = Math.min(5, Math.max(1, countWord ? (NUMBER_WORDS[countWord] ?? Number(countWord)) || 3 : 3));
    return { reply: "I'll draft these for you to review:", actions: propose(ctx, [{ type: "draft_social_posts", topic: topicOf(message), platforms: platforms.length ? platforms : ["LINKEDIN"], count }]) };
  }


  const pages: [RegExp, string, string][] = [
    [/billing|plan|invoice/, "/app/billing", "Billing"],
    [/brand/, "/app/brand", "Brand Kit"],
    [/integrations?|connect/, "/app/integrations", "Integrations"],
    [/templates?/, "/app/templates", "Templates"],
    [/setup|onboard/, "/app/setup", "Guided setup"],
    [/automations?|workflows?/, "/app/automations", "Automations"],
    [/seo|keywords?/, "/app/seo", "SEO"],
    [/team|members?|invite/, "/app/settings/team", "Team"],
    [/settings/, "/app/settings", "Settings"],
  ];
  if (/\b(open|go to|show( me)?|take me to|where is)\b/.test(m)) {
    const p = pages.find(([re]) => re.test(m));
    if (p) return { reply: `Here you go:`, actions: [{ id: "nav", title: `Open ${p[2]}`, description: p[1], action: { type: "navigate", href: p[1], label: p[2] } }] };
  }

  // Anything else: a helpful AI answer with the workspace in mind.
  return { reply: await freeAnswer(ctx, message, []), actions: [], suggestions: SUGGESTIONS.slice(0, 3) };
}

async function workspaceSnapshot(ws: string): Promise<string> {
  const [o, insights, campaigns] = await Promise.all([
    overview(ws, resolveRange({ days: 30 })),
    workspaceInsights(ws),
    db.campaign.findMany({ where: { workspaceId: ws, deletedAt: null, status: { in: ["ACTIVE", "PLANNING", "DRAFT"] } }, take: 5, orderBy: { updatedAt: "desc" }, select: { name: true, status: true } }),
  ]);
  const k = o.kpis;
  return [
    `Last 30 days: ${k.leadsGenerated.value} leads (prev ${k.leadsGenerated.previous}), reach ${k.socialReach.value}, engagement ${k.engagement.value}, conversion ${(k.conversionRate.value * 100).toFixed(2)}%, ${k.activeCampaigns.value} active campaigns.`,
    `Campaigns: ${campaigns.map((c) => `${c.name} (${c.status})`).join("; ") || "none"}.`,
    `Signals: ${insights.slice(0, 5).map((i) => i.title).join("; ") || "none"}.`,
  ].join("\n");
}

async function freeAnswer(ctx: WorkspaceContext, message: string, history: ChatTurn[]): Promise<string> {
  const r = await generateText({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    feature: "copilot:answer",
    maxTokens: 2500,
    system: `You are InfinityOps Copilot, a concise marketing operations assistant inside the user's workspace. Answer practically in Markdown, under 250 words.\n\nWorkspace snapshot:\n${await workspaceSnapshot(ctx.workspace.id)}`,
    messages: [...history.slice(-6), { role: "user", content: message }],
  });
  return r.text;
}

// ─── LLM planner (real models) ───

const llmReplySchema = z.object({ reply: z.string().min(1).max(6000), actions: z.array(z.unknown()).max(4).default([]) });

async function llmPlan(ctx: WorkspaceContext, message: string, history: ChatTurn[], voice = false): Promise<CopilotReply | null> {
  const ws = ctx.workspace.id;
  const workers = WORKER_TEMPLATES.map((w) => `${w.key} (${w.name}, ${w.title})`).join(", ");
  const system = `You are InfinityOps Copilot inside a marketing operations app. Decide how to help with the user's latest message.

Reply with ONLY a JSON object: {"reply": "<markdown answer, under 200 words>", "actions": [<0-3 proposed actions>]}.
${voice ? 'The user is talking to you by voice and will HEAR "reply": write at most 3 short, natural spoken sentences — no markdown, tables, lists, links or emoji. Lead with the answer.\n' : ""}Propose actions only when the user asks you to create or do something. The user approves each action before it runs, so describe what you'll do in "reply" rather than claiming it is done.

Action shapes:
- {"type":"launch_ai_campaign","goal":"<one-sentence goal>"}  (full campaign with strategy, content, social, email)
- {"type":"create_campaign","name":"<name>","description":"<optional>"}
- {"type":"create_content","kind":"blog|ad|landing|email|product|seo-meta","topic":"<topic>"}
- {"type":"draft_social_posts","topic":"<topic>","platforms":["LINKEDIN"|"INSTAGRAM"|"X"|"FACEBOOK"],"count":1-5}
- {"type":"create_lead","firstName":"","lastName":"","email":"","company":""}
- {"type":"assign_worker_task","workerKey":"<one of: ${workers}>","instructions":"<brief>"}
- {"type":"navigate","href":"/app/<page>","label":"<page name>"}

Use the workspace data below to answer questions with real numbers. Never invent numbers.

Workspace data:
${await workspaceSnapshot(ws)}

Hot leads:
${await hotLeadsAnswer(ws)}

Approvals:
${await approvalsAnswer(ws)}`;
  const r = await generateText({ workspaceId: ws, userId: ctx.user.id, feature: "copilot:plan", system, maxTokens: 3000, useBrandContext: true, messages: [...history.slice(-8), { role: "user", content: message }] });
  const json = r.text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  let parsed: z.infer<typeof llmReplySchema>;
  try {
    const p = llmReplySchema.safeParse(JSON.parse(json));
    if (!p.success) return null;
    parsed = p.data;
  } catch {
    return null;
  }
  const actions = parsed.actions.map((a) => actionSchema.safeParse(a)).filter((a) => a.success).map((a) => a.data!);
  return { reply: parsed.reply, actions: propose(ctx, actions) };
}

/** The worker capability whose name best matches the request (falls back to the worker's first capability). */
export function pickCapability(workerKey: string, instructions: string): string {
  const caps = getWorkerTemplate(workerKey)?.capabilities ?? [];
  const words = new Set(instructions.toLowerCase().match(/[a-z]{3,}/g) ?? []);
  let best = caps[0];
  let bestScore = 0;
  for (const c of caps) {
    const wordHits = `${c.key} ${c.label}`.toLowerCase().match(/[a-z]{3,}/g)?.filter((w) => words.has(w) || words.has(`${w}s`) || words.has(w.replace(/s$/, ""))).length ?? 0;
    // Naming the capability outright ("ad copy") beats partial word overlap ("copy").
    const score = wordHits + (instructions.toLowerCase().includes(c.label.toLowerCase()) ? 5 : 0);
    if (score > bestScore) [best, bestScore] = [c, score];
  }
  if (!best) throw notFound("Worker capability");
  return best.key;
}

// ─── Entry points ───

export async function copilotPlan(ctx: WorkspaceContext, message: string, history: ChatTurn[] = [], opts: { voice?: boolean } = {}): Promise<CopilotReply> {
  const model = await resolveModel(null);
  if (model.provider !== "local") {
    try {
      const planned = await llmPlan(ctx, message, history, opts.voice);
      if (planned) return planned;
    } catch (err) {
      logger.warn("Copilot LLM planner failed; falling back to rules", { err });
    }
  }
  return rulePlan(ctx, message);
}

export type ExecuteResult = { message: string; href?: string };

/** Runs one approved action. Permissions are re-checked here — proposals are never trusted. */
export async function copilotExecute(ctx: WorkspaceContext, action: CopilotAction): Promise<ExecuteResult> {
  const perm = PERMISSION[action.type];
  if (perm && !can(ctx, perm)) throw forbidden("Your role can't do that");
  const ws = ctx.workspace.id;
  let result: ExecuteResult;

  switch (action.type) {
    case "navigate":
      return { message: `Opening ${action.label}`, href: action.href };
    case "launch_ai_campaign": {
      const { runAutopilotToEnd } = await import("./autopilot");
      const r = await runAutopilotToEnd(ctx, { goal: action.goal, channels: ["blog", "linkedin", "instagram", "email"], durationWeeks: 4 });
      result = { message: r.summary + (r.errors.length ? ` Some steps need attention: ${r.errors.join("; ")}` : ""), href: r.href };
      break;
    }
    case "create_campaign": {
      const c = await createCampaign(ctx, { name: action.name, description: action.description ?? null });
      result = { message: `Created campaign “${c.name}”.`, href: `/app/campaigns/${c.id}` };
      break;
    }
    case "create_content": {
      const kind = action.kind as GeneratorKey;
      const kit = await db.brandKit.findUnique({ where: { workspaceId: ws } });
      const writer = await db.aIWorker.findFirst({ where: { workspaceId: ws, key: "content-writer" } });
      const r = await generateText({ workspaceId: ws, userId: ctx.user.id, feature: `copilot:content:${kind}`, system: writer?.systemPrompt, model: writer?.model, maxTokens: 6000, messages: [{ role: "user", content: buildGeneratorPrompt(kind, { topic: action.topic, audience: kit?.targetAudience ?? undefined, length: "medium", platform: "LinkedIn" }, kit?.voice ?? undefined) }] });
      const title = r.text.match(/^#{1,2}\s+(.+)$/m)?.[1]?.trim() ?? action.topic;
      const content = await createContent(ctx, { title: title.slice(0, 200), type: GENERATORS[kind].type, body: r.text, generatedByAI: true });
      result = { message: `Drafted “${content.title}”.`, href: `/app/content/${content.id}` };
      break;
    }
    case "draft_social_posts": {
      const pulse = await db.aIWorker.findFirst({ where: { workspaceId: ws, key: "social-media-manager" } });
      let total = 0;
      for (const platform of action.platforms as SocialPlatform[]) {
        const r = await generateText({ workspaceId: ws, userId: ctx.user.id, feature: "copilot:social", system: pulse?.systemPrompt, model: pulse?.model, maxTokens: 3000, messages: [{ role: "user", content: `Write ${action.count} distinct ${PLATFORM_LABELS[platform]} social posts.\nTopic: ${action.topic}\nEach: a hook, one clear point, a call to action and 2-4 hashtags, under ${Math.min(PLATFORM_LIMITS[platform], 1200)} characters. Separate posts with a line containing only ===` }] });
        const account = await db.socialAccount.findFirst({ where: { workspaceId: ws, platform }, select: { id: true } });
        for (const text of splitPosts(r.text, platform, action.count)) {
          await createPost(ctx, { platform, socialAccountId: account?.id ?? null, text: text.length > PLATFORM_LIMITS[platform] ? `${text.slice(0, PLATFORM_LIMITS[platform] - 1)}…` : text, submit: "draft" });
          total++;
        }
      }
      result = { message: `Drafted ${total} post${total === 1 ? "" : "s"} — review them in Social Media.`, href: "/app/social" };
      break;
    }
    case "create_lead": {
      const lead = await createLead(ctx, { firstName: action.firstName, lastName: action.lastName ?? null, email: action.email ?? null, company: action.company ?? null, source: "MANUAL" }, { activity: "Lead added by Copilot" });
      result = { message: `Added ${lead.firstName} to your leads (score ${lead.score}).`, href: `/app/leads/${lead.id}` };
      break;
    }
    case "assign_worker_task": {
      const worker = await db.aIWorker.findFirst({ where: { workspaceId: ws, key: action.workerKey } });
      if (!worker) throw notFound("AI worker");
      const task = await createTask(ctx, worker.id, { capability: pickCapability(worker.key, action.instructions), instructions: action.instructions });
      result = { message: `${worker.name} is on it — the output will appear for review.`, href: `/app/workers/${worker.id}?task=${task.id}` };
      break;
    }
  }
  await audit({ action: "copilot.action", workspaceId: ws, actorId: ctx.user.id, metadata: { type: action.type } });
  return result;
}
