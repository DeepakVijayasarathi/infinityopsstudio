import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { runAutopilot, runAutopilotToEnd } from "@/server/services/autopilot";
import { workspaceInsights, weeklyDigest } from "@/server/services/insights";
import { createLead, explainLeadScore } from "@/server/services/leads";
import { createOwner, resetDb } from "../helpers/factory";

beforeEach(resetDb);

describe("campaign autopilot", () => {
  it("builds a complete draft campaign from one goal", async () => {
    const ctx = await createOwner();
    const r = await runAutopilotToEnd(ctx, { goal: "Get 200 demo sign-ups for our new route optimizer", channels: ["blog", "linkedin", "x", "email"], durationWeeks: 2 });
    expect(r.errors).toEqual([]);

    const campaign = await db.campaign.findUniqueOrThrow({ where: { id: r.campaignId }, include: { tasks: true } });
    expect(campaign.objective).toBe("LEADS");
    expect(campaign.status).toBe("DRAFT");
    expect(campaign.strategy?.length).toBeGreaterThan(100);
    expect(campaign.tasks.length).toBeGreaterThan(0);

    expect(await db.content.count({ where: { campaignId: campaign.id, type: "BLOG_POST" } })).toBe(1);
    const posts = await db.socialPost.findMany({ where: { campaignId: campaign.id } });
    expect(posts.length).toBeGreaterThanOrEqual(2);
    expect(posts.every((p) => p.status === "DRAFT" && p.scheduledAt && p.scheduledAt > new Date())).toBe(true);
    expect(posts.filter((p) => p.platform === "X").every((p) => p.text.length <= 280)).toBe(true);

    const email = await db.emailCampaign.findFirstOrThrow({ where: { campaignId: campaign.id } });
    expect(email.status).toBe("DRAFT");
    expect(email.subject.length).toBeGreaterThan(3);

    const wf = await db.workflow.findFirstOrThrow({ where: { workspaceId: ctx.workspace.id, trigger: "LEAD_CREATED" } });
    expect(wf.isEnabled).toBe(false);
  });

  it("streams step progress ending with done", async () => {
    const ctx = await createOwner();
    const events = [];
    for await (const e of runAutopilot(ctx, { goal: "Grow awareness of our brand in Chennai", channels: ["instagram"], durationWeeks: 1, postsPerChannel: 2 })) events.push(e);
    expect(events[0]).toMatchObject({ type: "step", key: "campaign", status: "running" });
    expect(events.at(-1)).toMatchObject({ type: "done" });
    expect(events.some((e) => e.type === "step" && e.key === "social-instagram" && e.status === "done")).toBe(true);
  });
});

describe("smart insights", () => {
  it("surfaces hot leads that need follow-up and explains their score", async () => {
    const ctx = await createOwner();
    const lead = await createLead(ctx, { firstName: "Priya", email: "priya@bigco.com", phone: "123", company: "BigCo", website: "bigco.com", jobTitle: "CEO", source: "REFERRAL", status: "QUALIFIED" });
    expect(lead.score).toBeGreaterThanOrEqual(70);

    const insights = await workspaceInsights(ctx.workspace.id);
    const hot = insights.find((i) => i.id === "hot-leads");
    expect(hot?.action?.href).toBe(`/app/leads/${lead.id}`);
    expect(insights.find((i) => i.id === "empty-calendar")).toBeDefined();

    const explained = await explainLeadScore(ctx.workspace.id, lead.id);
    expect(explained.score).toBe(lead.score);
    expect(explained.nextStep).toMatch(/hot lead/i);
  });

  it("detects a traffic drop from daily metrics", async () => {
    const ctx = await createOwner();
    const today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
    const rows = Array.from({ length: 17 }, (_, i) => ({ workspaceId: ctx.workspace.id, channel: "WEBSITE" as const, date: new Date(today.getTime() - (17 - i) * 86_400_000), visits: i >= 14 ? 30 : 200 + (i % 3) * 5 }));
    await db.metricDaily.createMany({ data: rows });
    const insights = await workspaceInsights(ctx.workspace.id);
    expect(insights[0]).toMatchObject({ id: "anomaly-visits", severity: "critical" });
  });

  it("creates the weekly digest once per week and notifies the team", async () => {
    const ctx = await createOwner();
    const first = await weeklyDigest(ctx.workspace.id);
    expect(first?.title).toMatch(/^Weekly insights — \d{4}-W\d{2}$/);
    expect(await weeklyDigest(ctx.workspace.id)).toBeNull();
    expect(await db.notification.count({ where: { workspaceId: ctx.workspace.id, type: "report.weekly" } })).toBe(1);
  });
});

describe("templates", () => {
  it("creates drafts from campaign, email and automation templates", async () => {
    const { applyTemplate } = await import("@/server/services/templates");
    const ctx = await createOwner();
    const c = await applyTemplate(ctx, "campaign", "webinar");
    const campaign = await db.campaign.findUniqueOrThrow({ where: { id: c.id }, include: { tasks: true } });
    expect(campaign.status).toBe("DRAFT");
    expect(campaign.tasks.length).toBe(8);
    const e = await applyTemplate(ctx, "email", "welcome");
    expect((await db.emailTemplate.findUniqueOrThrow({ where: { id: e.id } })).subject).toContain("{{first_name}}");
    const a = await applyTemplate(ctx, "automation", "lead-welcome");
    const wf = await db.workflow.findUniqueOrThrow({ where: { id: a.id }, include: { nodes: true } });
    expect(wf.isEnabled).toBe(false);
    expect(wf.nodes.length).toBe(4);
    await expect(applyTemplate(ctx, "campaign", "nope")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
