import type { CampaignObjective, SocialPlatform } from "@prisma/client";
import { db } from "../db";
import { AppError } from "../errors";
import { audit } from "../audit";
import { generateText } from "../ai/service";
import { buildGeneratorPrompt } from "../ai/prompts";
import { assertCan, type WorkspaceContext } from "../tenant";
import { createCampaign, strategyPrompt, tasksFromStrategy } from "./campaigns";
import { createContent } from "./content";
import { createPost } from "./social";
import { createEmailCampaign } from "./email";
import { createWorkflow } from "./automations";
import { PLATFORM_LABELS, PLATFORM_LIMITS } from "@/lib/constants";

/**
 * Campaign autopilot: turns one goal into a ready-to-review campaign — strategy, tasks,
 * a blog post, scheduled social drafts, an email draft and a follow-up automation.
 * Everything is created as a draft for human review; nothing is published or sent.
 */

export const AUTOPILOT_CHANNELS = ["blog", "linkedin", "instagram", "x", "facebook", "email"] as const;
export type AutopilotChannel = (typeof AUTOPILOT_CHANNELS)[number];

export type AutopilotInput = {
  goal: string;
  audience?: string | null;
  channels: AutopilotChannel[];
  durationWeeks: number;
  budgetCents?: number;
  postsPerChannel?: number;
};

export type AutopilotEvent =
  | { type: "step"; key: string; label: string; status: "running" | "done" | "skipped" | "error"; detail?: string; href?: string }
  | { type: "done"; campaignId: string; href: string; summary: string };

const SOCIAL: Partial<Record<AutopilotChannel, SocialPlatform>> = { linkedin: "LINKEDIN", instagram: "INSTAGRAM", x: "X", facebook: "FACEBOOK" };
const DAY = 86_400_000;

export function inferObjective(goal: string): CampaignObjective {
  const g = goal.toLowerCase();
  if (/\b(sales?|revenue|purchase|buy|orders?|discount|offer|deal)\b/.test(g)) return "SALES";
  if (/\b(leads?|sign ?ups?|demos?|trials?|webinar|registrations?|book(ings)?)\b/.test(g)) return "LEADS";
  if (/\b(traffic|visits|visitors|website)\b/.test(g)) return "TRAFFIC";
  if (/\b(conversions?|convert)\b/.test(g)) return "CONVERSIONS";
  if (/\b(retain|retention|churn|loyal|existing customers)\b/.test(g)) return "RETENTION";
  if (/\b(engage|engagement|community|followers)\b/.test(g)) return "ENGAGEMENT";
  return "AWARENESS";
}

/** "launch our new route optimizer for 3PLs next month" → "Launch our new route optimizer for 3PLs next month" (≤ 80 chars). */
export function campaignName(goal: string): string {
  const clean = goal.replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
  const cut = clean.length > 80 ? `${clean.slice(0, 77).replace(/\s+\S*$/, "")}…` : clean;
  return cut.charAt(0).toUpperCase() + cut.slice(1);
}

/** Splits an AI response into individual posts for one platform. */
export function splitPosts(text: string, platform: SocialPlatform, max: number): string[] {
  const parts = text
    .split(/\n\s*={3,}\s*\n/)
    .map((p) => p.replace(/^#+\s.*$/m, "").replace(/^\s*(\*\*)?(post|variation)\s*\d+[:.)]?(\*\*)?\s*/i, "").trim())
    .filter((p) => p.length > 20);
  if (parts.length > 1) return parts.slice(0, max);
  // Single block: look for a "**LinkedIn**"-style section for this platform, else use the whole text.
  const label = PLATFORM_LABELS[platform].split(" ")[0]!;
  const section = text.match(new RegExp(`\\*\\*${label}\\*\\*\\s*\\n+([\\s\\S]*?)(?=\\n\\*\\*[A-Z][^*]*\\*\\*\\s*\\n|$)`));
  const one = (section?.[1] ?? text).trim();
  return one ? [one] : [];
}

/** Pulls a subject line and body out of an AI-written email. */
export function parseEmail(text: string, fallbackSubject: string): { subject: string; body: string } {
  const subject =
    text.match(/^\s*\**subject(?: line)?\**\s*:\s*(.+)$/im)?.[1] ??
    text.match(/subject line[^\n]*\n+\s*1\.\s*(.+)/i)?.[1] ??
    fallbackSubject;
  const afterRule = text.split(/\n-{3,}\n/);
  const body = (afterRule.length > 1 ? afterRule.slice(1).join("\n---\n") : text).trim();
  return { subject: subject.replace(/\*\*/g, "").replace(/^["“]|["”]$/g, "").trim().slice(0, 200), body };
}

const clip = (text: string, limit: number) => (text.length <= limit ? text : `${text.slice(0, limit - 1).replace(/\s+\S*$/, "")}…`);

export async function* runAutopilot(ctx: WorkspaceContext, input: AutopilotInput): AsyncGenerator<AutopilotEvent> {
  assertCan(ctx, "campaigns:write");
  const ws = ctx.workspace.id;
  const kit = await db.brandKit.findUnique({ where: { workspaceId: ws } });
  const audience = input.audience?.trim() || kit?.targetAudience || undefined;
  const channels = [...new Set(input.channels)];
  const perChannel = Math.min(6, Math.max(1, input.postsPerChannel ?? Math.min(6, input.durationWeeks * 2)));
  const start = new Date(Date.now() + DAY);
  start.setUTCHours(9, 0, 0, 0);
  const end = new Date(start.getTime() + input.durationWeeks * 7 * DAY);
  const created: string[] = [];

  // 1. Campaign (required — everything else hangs off it)
  yield { type: "step", key: "campaign", label: "Create campaign", status: "running" };
  const campaign = await createCampaign(ctx, {
    name: campaignName(input.goal),
    description: input.goal,
    objective: inferObjective(input.goal),
    targetAudience: audience ?? null,
    budgetCents: input.budgetCents ?? 0,
    startDate: start,
    endDate: end,
    channels: channels.map((c) => (c === "x" ? "X" : c.charAt(0).toUpperCase() + c.slice(1))),
  });
  const href = `/app/campaigns/${campaign.id}`;
  yield { type: "step", key: "campaign", label: "Create campaign", status: "done", detail: campaign.name, href };

  const ai = async (feature: string, workerKey: string, prompt: string) => {
    const worker = await db.aIWorker.findFirst({ where: { workspaceId: ws, key: workerKey } });
    const r = await generateText({ workspaceId: ws, userId: ctx.user.id, feature: `autopilot:${feature}`, system: worker?.systemPrompt, model: worker?.model, maxTokens: 6000, messages: [{ role: "user", content: prompt }] });
    return r.text;
  };
  const failed = (err: unknown) => (err instanceof AppError || err instanceof Error ? err.message : "Step failed");

  // 2. Strategy + tasks
  yield { type: "step", key: "strategy", label: "Write strategy and tasks", status: "running" };
  try {
    const strategy = await ai("strategy", "marketing-strategist", strategyPrompt(campaign));
    await db.campaign.update({ where: { id: campaign.id }, data: { strategy } });
    const tasks = await tasksFromStrategy(ctx, campaign.id).catch(() => ({ created: 0 }));
    created.push(`strategy with ${tasks.created} tasks`);
    yield { type: "step", key: "strategy", label: "Write strategy and tasks", status: "done", detail: `${tasks.created} tasks added`, href };
  } catch (err) {
    yield { type: "step", key: "strategy", label: "Write strategy and tasks", status: "error", detail: failed(err) };
  }

  // 3. Blog post
  if (channels.includes("blog")) {
    yield { type: "step", key: "blog", label: "Draft blog post", status: "running" };
    try {
      const body = await ai("blog", "content-writer", buildGeneratorPrompt("blog", { topic: input.goal, audience, length: "about 900 words" }, kit?.voice ?? undefined));
      const title = body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? campaign.name;
      const content = await createContent(ctx, { title: title.slice(0, 200), type: "BLOG_POST", body, campaignId: campaign.id, generatedByAI: true });
      created.push("1 blog post");
      yield { type: "step", key: "blog", label: "Draft blog post", status: "done", detail: title, href: `/app/content/${content.id}` };
    } catch (err) {
      yield { type: "step", key: "blog", label: "Draft blog post", status: "error", detail: failed(err) };
    }
  }

  // 4. Social posts, spread across the campaign as drafts on the calendar
  for (const ch of channels) {
    const platform = SOCIAL[ch];
    if (!platform) continue;
    const key = `social-${ch}`;
    const label = `Draft ${PLATFORM_LABELS[platform]} posts`;
    yield { type: "step", key, label, status: "running" };
    try {
      const text = await ai(
        `social-${ch}`,
        "social-media-manager",
        `Write ${perChannel} distinct ${PLATFORM_LABELS[platform]} social posts for this campaign.\nTopic: ${input.goal}\nAudience: ${audience ?? "our ideal customers"}\nEach post: a scroll-stopping hook, one clear point, a call to action and 2-4 hashtags. Keep each under ${Math.min(PLATFORM_LIMITS[platform], 1200)} characters. Separate posts with a line containing only ===`,
      );
      const posts = splitPosts(text, platform, perChannel);
      const account = await db.socialAccount.findFirst({ where: { workspaceId: ws, platform }, select: { id: true } });
      const gap = Math.max(DAY, Math.floor((end.getTime() - start.getTime()) / Math.max(1, posts.length)));
      for (let i = 0; i < posts.length; i++) {
        await createPost(ctx, { platform, socialAccountId: account?.id ?? null, text: clip(posts[i]!, PLATFORM_LIMITS[platform]), scheduledAt: new Date(start.getTime() + i * gap), campaignId: campaign.id, submit: "draft" });
      }
      created.push(`${posts.length} ${PLATFORM_LABELS[platform]} posts`);
      yield { type: "step", key, label, status: posts.length ? "done" : "skipped", detail: posts.length ? `${posts.length} drafts on the calendar` : "The AI returned no usable posts", href: "/app/social" };
    } catch (err) {
      yield { type: "step", key, label, status: "error", detail: failed(err) };
    }
  }

  // 5. Email
  if (channels.includes("email")) {
    yield { type: "step", key: "email", label: "Draft email", status: "running" };
    try {
      const text = await ai("email", "email-specialist", buildGeneratorPrompt("email", { topic: input.goal, audience, length: "short" }, kit?.voice ?? undefined));
      const { subject, body } = parseEmail(text, campaign.name);
      const email = await createEmailCampaign(ctx, { name: `${campaign.name} — email`, type: "BROADCAST", subject, body, segment: { statuses: ["NEW", "CONTACTED", "QUALIFIED"] }, campaignId: campaign.id });
      created.push("1 email draft");
      yield { type: "step", key: "email", label: "Draft email", status: "done", detail: subject, href: `/app/email/${email.id}` };
    } catch (err) {
      yield { type: "step", key: "email", label: "Draft email", status: "error", detail: failed(err) };
    }
  }

  // 6. Follow-up automation for leads attributed to this campaign (created disabled)
  yield { type: "step", key: "automation", label: "Set up lead follow-up automation", status: "running" };
  try {
    const wf = await createWorkflow(ctx, {
      name: `${clip(campaign.name, 60)} — new lead follow-up`,
      description: "Created by the campaign autopilot. Enable it when the campaign goes live.",
      trigger: "LEAD_CREATED",
      nodes: [
        { type: "CONDITION", label: "Lead came from this campaign", config: { field: "lead.campaignId", operator: "equals", value: campaign.id } },
        { type: "UPDATE_LEAD", label: "Tag lead", config: { addTag: "autopilot", scoreDelta: 5 } },
        { type: "NOTIFY", label: "Tell the team", config: { title: "New lead from {{payload.firstName}} via the campaign", body: "" } },
      ],
    });
    created.push("1 automation (off)");
    yield { type: "step", key: "automation", label: "Set up lead follow-up automation", status: "done", detail: "Created switched off — enable it at launch", href: `/app/automations/${wf.id}` };
  } catch (err) {
    yield { type: "step", key: "automation", label: "Set up lead follow-up automation", status: "error", detail: failed(err) };
  }

  await audit({ action: "campaign.autopilot", workspaceId: ws, actorId: ctx.user.id, entityType: "Campaign", entityId: campaign.id, metadata: { channels, created } });
  yield { type: "done", campaignId: campaign.id, href, summary: `Created ${created.join(", ") || "the campaign"}. Everything is a draft for your review.` };
}

/** Runs the autopilot to completion (used by the Copilot). */
export async function runAutopilotToEnd(ctx: WorkspaceContext, input: AutopilotInput) {
  let result: Extract<AutopilotEvent, { type: "done" }> | null = null;
  const errors: string[] = [];
  for await (const e of runAutopilot(ctx, input)) {
    if (e.type === "done") result = e;
    else if (e.status === "error") errors.push(`${e.label}: ${e.detail}`);
  }
  return { ...result!, errors };
}
