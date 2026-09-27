import type { Prisma, SocialPlatform, SocialPostStatus } from "@prisma/client";
import { db } from "../db";
import { badRequest, forbidden, notFound, paymentRequired } from "../errors";
import { audit } from "../audit";
import { decrypt, encrypt } from "../crypto";
import { enqueue } from "../queue";
import { generateText, streamText } from "../ai/service";
import type { WorkspaceContext } from "../tenant";
import { can } from "../tenant";
import { paginated, pageArgs, type PaginationInput } from "../pagination";
import { canAutoPublish, PUBLISHERS, PublishError } from "../integrations/social";
import { notify } from "./notifications";
import { recordUsage } from "../billing/usage";
import { getPlan, withinLimit } from "@/config/plans";
import { PLATFORM_LIMITS, PLATFORM_LABELS } from "@/lib/constants";

// ─── Accounts ───

export async function listAccounts(workspaceId: string) {
  const accounts = await db.socialAccount.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" }, include: { _count: { select: { posts: true } } } });
  return accounts.map(({ accessToken, refreshToken: _r, ...a }) => ({ ...a, hasToken: !!accessToken, autoPublish: !!accessToken && canAutoPublish(a.platform) }));
}

export async function connectAccount(ctx: WorkspaceContext, input: { platform: SocialPlatform; handle: string; displayName?: string; accessToken?: string; externalId?: string }) {
  const plan = getPlan(ctx.plan);
  const count = await db.socialAccount.count({ where: { workspaceId: ctx.workspace.id } });
  if (!withinLimit(plan.limits.socialAccounts, count)) throw paymentRequired(`The ${plan.name} plan includes ${plan.limits.socialAccounts} social account(s). Upgrade to connect more.`);
  const handle = input.handle.trim().replace(/^@/, "");
  const account = await db.socialAccount.create({
    data: {
      workspaceId: ctx.workspace.id,
      platform: input.platform,
      handle,
      displayName: input.displayName || handle,
      externalId: input.externalId || null,
      accessToken: input.accessToken ? encrypt(input.accessToken) : null,
      connectedById: ctx.user.id,
      status: "CONNECTED",
    },
  });
  await audit({ action: "social.account_connected", workspaceId: ctx.workspace.id, actorId: ctx.user.id, entityType: "SocialAccount", entityId: account.id, metadata: { platform: input.platform, handle } });
  return { id: account.id };
}

export async function disconnectAccount(ctx: WorkspaceContext, id: string) {
  const acc = await db.socialAccount.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!acc) throw notFound("Social account");
  await db.socialAccount.delete({ where: { id } });
  await audit({ action: "social.account_disconnected", workspaceId: ctx.workspace.id, actorId: ctx.user.id, entityType: "SocialAccount", entityId: id });
}

// ─── Posts ───

export type PostInput = {
  platform: SocialPlatform;
  socialAccountId?: string | null;
  text: string;
  mediaUrls?: string[];
  hashtags?: string[];
  scheduledAt?: Date | null;
  campaignId?: string | null;
  contentId?: string | null;
};

async function validatePost(ctx: WorkspaceContext, input: Partial<PostInput>, platform: SocialPlatform) {
  if (input.text !== undefined) {
    const full = `${input.text}${input.hashtags?.length ? `\n\n${input.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}` : ""}`;
    if (full.length > PLATFORM_LIMITS[platform]) throw badRequest(`${PLATFORM_LABELS[platform]} posts are limited to ${PLATFORM_LIMITS[platform]} characters`);
  }
  if (input.socialAccountId) {
    const acc = await db.socialAccount.findFirst({ where: { id: input.socialAccountId, workspaceId: ctx.workspace.id } });
    if (!acc) throw notFound("Social account");
    if (acc.platform !== platform) throw badRequest("The selected account is for a different platform");
  }
  if (input.campaignId && !(await db.campaign.findFirst({ where: { id: input.campaignId, workspaceId: ctx.workspace.id } }))) throw notFound("Campaign");
}

export async function listPosts(workspaceId: string, p: PaginationInput & { status?: SocialPostStatus; platform?: SocialPlatform; from?: Date; to?: Date }) {
  const where: Prisma.SocialPostWhereInput = {
    workspaceId,
    ...(p.status ? { status: p.status } : {}),
    ...(p.platform ? { platform: p.platform } : {}),
    ...(p.from || p.to ? { OR: [{ scheduledAt: { gte: p.from, lte: p.to } }, { publishedAt: { gte: p.from, lte: p.to } }] } : {}),
    ...(p.q ? { text: { contains: p.q, mode: "insensitive" } } : {}),
  };
  const [items, total] = await Promise.all([
    db.socialPost.findMany({
      where,
      include: { socialAccount: { select: { id: true, handle: true, displayName: true } }, campaign: { select: { id: true, name: true } } },
      orderBy: [{ scheduledAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      ...pageArgs(p),
    }),
    db.socialPost.count({ where }),
  ]);
  return paginated(items, total, p);
}

export async function calendar(workspaceId: string, from: Date, to: Date) {
  return db.socialPost.findMany({
    where: { workspaceId, OR: [{ scheduledAt: { gte: from, lte: to } }, { publishedAt: { gte: from, lte: to } }] },
    include: { socialAccount: { select: { id: true, handle: true } }, campaign: { select: { id: true, name: true } } },
    orderBy: { scheduledAt: "asc" },
    take: 500,
  });
}

export async function getPost(workspaceId: string, id: string) {
  const post = await db.socialPost.findFirst({ where: { id, workspaceId }, include: { socialAccount: { select: { id: true, handle: true, platform: true } }, campaign: { select: { id: true, name: true } } } });
  if (!post) throw notFound("Post");
  return post;
}

export async function createPost(ctx: WorkspaceContext, input: PostInput & { submit?: "draft" | "approval" | "schedule" }) {
  await validatePost(ctx, input, input.platform);
  let status: SocialPostStatus = "DRAFT";
  if (input.submit === "approval") status = "PENDING_APPROVAL";
  if (input.submit === "schedule") {
    if (!input.scheduledAt) throw badRequest("Choose a publish date and time");
    if (input.scheduledAt.getTime() < Date.now() - 60_000) throw badRequest("The scheduled time must be in the future");
    if (!can(ctx, "social:publish")) status = "PENDING_APPROVAL";
    else status = "SCHEDULED";
  }
  const { submit: _s, ...data } = input;
  const post = await db.socialPost.create({
    data: { ...data, mediaUrls: data.mediaUrls ?? [], hashtags: (data.hashtags ?? []).map((h) => h.replace(/^#/, "")), workspaceId: ctx.workspace.id, createdById: ctx.user.id, status },
  });
  if (status === "PENDING_APPROVAL") {
    await notify({ workspaceId: ctx.workspace.id, type: "ai_task.approval", title: `${ctx.user.name} submitted a ${PLATFORM_LABELS[input.platform]} post for approval`, link: "/app/social?tab=approvals", permission: "social:publish" });
  }
  await audit({ action: "social.post_created", workspaceId: ctx.workspace.id, actorId: ctx.user.id, entityType: "SocialPost", entityId: post.id, metadata: { status } });
  return post;
}

export async function updatePost(ctx: WorkspaceContext, id: string, input: Partial<PostInput>) {
  const post = await getPost(ctx.workspace.id, id);
  if (["PUBLISHED", "PUBLISHING"].includes(post.status)) throw badRequest("Published posts cannot be edited");
  await validatePost(ctx, input, input.platform ?? post.platform);
  if (input.scheduledAt && post.status === "SCHEDULED" && input.scheduledAt.getTime() < Date.now()) throw badRequest("The scheduled time must be in the future");
  return db.socialPost.update({ where: { id }, data: { ...input, ...(input.hashtags ? { hashtags: input.hashtags.map((h) => h.replace(/^#/, "")) } : {}) } });
}

export async function deletePost(ctx: WorkspaceContext, id: string) {
  const post = await getPost(ctx.workspace.id, id);
  if (post.status === "PUBLISHING") throw badRequest("This post is being published right now");
  await db.socialPost.delete({ where: { id } });
}

export async function reviewPost(ctx: WorkspaceContext, id: string, decision: "approve" | "reject") {
  const post = await getPost(ctx.workspace.id, id);
  if (post.status !== "PENDING_APPROVAL") throw badRequest("This post is not awaiting approval");
  const status: SocialPostStatus = decision === "reject" ? "DRAFT" : post.scheduledAt && post.scheduledAt > new Date() ? "SCHEDULED" : "DRAFT";
  const updated = await db.socialPost.update({ where: { id }, data: { status, approvedById: decision === "approve" ? ctx.user.id : null } });
  if (post.createdById) {
    await notify({ workspaceId: ctx.workspace.id, type: "ai_task.approval", title: decision === "approve" ? "Your social post was approved" : "Your social post needs changes", link: "/app/social", userIds: [post.createdById] });
  }
  await audit({ action: `social.post_${decision}d`, workspaceId: ctx.workspace.id, actorId: ctx.user.id, entityType: "SocialPost", entityId: id });
  return updated;
}

export async function schedulePost(ctx: WorkspaceContext, id: string, scheduledAt: Date) {
  const post = await getPost(ctx.workspace.id, id);
  if (!["DRAFT", "SCHEDULED", "FAILED"].includes(post.status)) throw badRequest("This post cannot be scheduled in its current state");
  if (scheduledAt.getTime() < Date.now() - 60_000) throw badRequest("The scheduled time must be in the future");
  if (!can(ctx, "social:publish")) {
    return db.socialPost.update({ where: { id }, data: { scheduledAt, status: "PENDING_APPROVAL" } });
  }
  return db.socialPost.update({ where: { id }, data: { scheduledAt, status: "SCHEDULED", error: null } });
}

export async function publishNow(ctx: WorkspaceContext, id: string) {
  if (!can(ctx, "social:publish")) throw forbidden("Only managers can publish posts");
  const post = await getPost(ctx.workspace.id, id);
  if (!["DRAFT", "SCHEDULED", "FAILED"].includes(post.status)) throw badRequest("This post cannot be published in its current state");
  if (!post.socialAccountId) throw badRequest("Select a connected account before publishing");
  await db.socialPost.update({ where: { id }, data: { status: "PUBLISHING", error: null } });
  await enqueue("social", { kind: "publish-post", postId: id });
}

/** Records a post published outside the platform (manual publishing flow). */
export async function markPublished(ctx: WorkspaceContext, id: string, externalUrl?: string) {
  const post = await getPost(ctx.workspace.id, id);
  if (post.status === "PUBLISHED") throw badRequest("Already published");
  await recordUsage({ workspaceId: ctx.workspace.id, userId: ctx.user.id, metric: "SOCIAL_POSTS", quantity: 1, refType: "SocialPost", refId: id });
  return db.socialPost.update({ where: { id }, data: { status: "PUBLISHED", publishedAt: new Date(), externalUrl: externalUrl || null, error: null } });
}

/** Background processor: publishes through the platform API. */
export async function processPublish(postId: string) {
  const post = await db.socialPost.findUnique({ where: { id: postId }, include: { socialAccount: true } });
  if (!post || post.status === "PUBLISHED") return;
  const publisher = PUBLISHERS[post.platform];
  const account = post.socialAccount;
  const fail = async (message: string) => {
    await db.socialPost.update({ where: { id: postId }, data: { status: "FAILED", error: message } });
    await notify({ workspaceId: post.workspaceId, type: "social.failed", title: `${PLATFORM_LABELS[post.platform]} post failed to publish`, body: message, link: "/app/social", permission: "social:publish" });
  };
  if (!account) return fail("No connected account selected");
  if (!publisher || !account.accessToken) {
    return fail(`${PLATFORM_LABELS[post.platform]} auto-publishing is not available for @${account.handle}. Add an access token to the account, or publish manually and mark the post as published.`);
  }
  try {
    const text = `${post.text}${post.hashtags.length ? `\n\n${post.hashtags.map((h) => `#${h}`).join(" ")}` : ""}`;
    const res = await publisher({ text, mediaUrls: post.mediaUrls, accessToken: decrypt(account.accessToken), externalId: account.externalId });
    await db.socialPost.update({ where: { id: postId }, data: { status: "PUBLISHED", publishedAt: new Date(), externalPostId: res.externalPostId, externalUrl: res.externalUrl, error: null } });
    await recordUsage({ workspaceId: post.workspaceId, metric: "SOCIAL_POSTS", quantity: 1, refType: "SocialPost", refId: postId });
  } catch (err) {
    if (err instanceof PublishError && err.retryable) throw err; // let the queue retry
    await fail(err instanceof Error ? err.message : "Publishing failed");
  }
}

/** Called by the scheduler: enqueue due scheduled posts. */
export async function enqueueDuePosts() {
  const due = await db.socialPost.findMany({ where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } }, select: { id: true }, take: 100 });
  for (const p of due) {
    await db.socialPost.update({ where: { id: p.id }, data: { status: "PUBLISHING" } });
    await enqueue("social", { kind: "publish-post", postId: p.id });
  }
  return due.length;
}

// ─── AI helpers ───

export async function captionStream(ctx: WorkspaceContext, input: { platform: SocialPlatform; topic: string; tone?: string; model?: string | null }) {
  const pulse = await db.aIWorker.findFirst({ where: { workspaceId: ctx.workspace.id, key: "social-media-manager" } });
  return streamText({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    feature: "social:caption",
    system: `${pulse?.systemPrompt ?? "You are a social media manager."} Output only the caption text, no headings, no hashtags (they are added separately).`,
    messages: [{ role: "user", content: `Write one ${PLATFORM_LABELS[input.platform]} caption (max ${Math.min(PLATFORM_LIMITS[input.platform], 600)} characters) with a strong hook and a clear CTA.\nTopic: ${input.topic}\nTone: ${input.tone ?? "Friendly"}` }],
    model: input.model,
  });
}

export async function suggestHashtags(ctx: WorkspaceContext, input: { platform: SocialPlatform; text: string }): Promise<string[]> {
  const result = await generateText({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    feature: "social:hashtags",
    system: "You suggest hashtags. Reply with 8 relevant hashtags separated by spaces, nothing else.",
    messages: [{ role: "user", content: `Platform: ${PLATFORM_LABELS[input.platform]}\nPost: ${input.text}` }],
    maxTokens: 200,
  });
  const tags = (result.text.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((t) => t.slice(1));
  if (tags.length) return [...new Set(tags)].slice(0, 10);
  // Fall back to keyword extraction from the post text.
  return [...new Set(input.text.toLowerCase().match(/\b[a-z]{5,}\b/g) ?? [])].slice(0, 6);
}

export async function socialAnalytics(workspaceId: string, days = 30) {
  const since = new Date(Date.now() - days * 86400_000);
  const [byPlatform, top, accounts] = await Promise.all([
    db.socialPost.groupBy({
      by: ["platform"],
      where: { workspaceId, status: "PUBLISHED", publishedAt: { gte: since } },
      _sum: { impressions: true, reach: true, likes: true, comments: true, shares: true, clicks: true },
      _count: true,
    }),
    db.socialPost.findMany({
      where: { workspaceId, status: "PUBLISHED", publishedAt: { gte: since } },
      orderBy: [{ likes: "desc" }],
      take: 5,
      select: { id: true, platform: true, text: true, likes: true, comments: true, shares: true, impressions: true, publishedAt: true },
    }),
    db.socialAccount.findMany({ where: { workspaceId }, select: { platform: true, handle: true, followers: true } }),
  ]);
  return {
    byPlatform: byPlatform.map((p) => {
      const s = p._sum;
      const engagements = (s.likes ?? 0) + (s.comments ?? 0) + (s.shares ?? 0);
      return { platform: p.platform, posts: p._count, ...s, engagements, engagementRate: s.impressions ? engagements / s.impressions : 0 };
    }),
    top,
    accounts,
  };
}
