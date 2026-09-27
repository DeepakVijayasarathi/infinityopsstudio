import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { copilotExecute, copilotPlan, pickCapability } from "@/server/services/copilot";
import { createLead } from "@/server/services/leads";
import { addMember, createOwner, resetDb } from "../helpers/factory";

beforeEach(resetDb);

const types = (r: { actions: { action: { type: string } }[] }) => r.actions.map((a) => a.action.type);

describe("copilot planner (demo AI)", () => {
  it("answers workspace questions from live data", async () => {
    const ctx = await createOwner();
    await createLead(ctx, { firstName: "Priya", lastName: "Shah", email: "priya@bigco.com", company: "BigCo", jobTitle: "CEO", source: "REFERRAL", status: "QUALIFIED" });
    const leads = await copilotPlan(ctx, "Which leads should I call today?");
    expect(leads.reply).toContain("Priya Shah");
    expect(leads.reply).toContain("BigCo");
    expect(leads.actions).toEqual([]);

    expect((await copilotPlan(ctx, "What needs my approval?")).reply).toMatch(/Nothing is waiting/);
    const perf = await copilotPlan(ctx, "How are we doing this month?");
    expect(perf.reply).toContain("| Leads | 1");
    expect(types(perf)).toEqual(["navigate"]);
  });

  it("turns requests into proposed actions", async () => {
    const ctx = await createOwner();
    expect(types(await copilotPlan(ctx, "Build a campaign to get 100 demo bookings in 4 weeks"))).toEqual(["launch_ai_campaign", "create_campaign"]);
    expect(types(await copilotPlan(ctx, 'Create a campaign called "Spring Promo"'))).toEqual(["create_campaign"]);

    const social = await copilotPlan(ctx, "Draft 2 LinkedIn and Instagram posts about our new feature");
    expect(social.actions[0]!.action).toMatchObject({ type: "draft_social_posts", platforms: ["LINKEDIN", "INSTAGRAM"], count: 2, topic: "our new feature" });

    expect((await copilotPlan(ctx, "Write a blog post about reducing delivery costs")).actions[0]!.action).toMatchObject({ type: "create_content", kind: "blog", topic: "reducing delivery costs" });
    expect((await copilotPlan(ctx, "Add lead Priya Shah priya@acme.com from Acme")).actions[0]!.action).toMatchObject({ type: "create_lead", firstName: "Priya", lastName: "Shah", email: "priya@acme.com", company: "Acme" });
    expect((await copilotPlan(ctx, "Ask Atlas for keyword ideas for route optimization")).actions[0]!.action).toMatchObject({ type: "assign_worker_task", workerKey: "seo-specialist" });
    expect((await copilotPlan(ctx, "open billing")).actions[0]!.action).toMatchObject({ type: "navigate", href: "/app/billing" });
  });

  it("only proposes actions the member is allowed to take", async () => {
    const owner = await createOwner();
    const viewer = await addMember(owner.workspace.id, "viewer");
    expect((await copilotPlan(viewer, "Write a blog post about coffee")).actions).toEqual([]);
  });
});

describe("copilot actions", () => {
  it("executes approved actions", async () => {
    const ctx = await createOwner();
    const lead = await copilotExecute(ctx, { type: "create_lead", firstName: "Dana", email: "dana@example.com" });
    expect(lead.href).toMatch(/^\/app\/leads\//);

    const content = await copilotExecute(ctx, { type: "create_content", kind: "blog", topic: "Five ways to cut fuel costs" });
    expect(await db.content.count({ where: { workspaceId: ctx.workspace.id, type: "BLOG_POST" } })).toBe(1);
    expect(content.href).toMatch(/^\/app\/content\//);

    await copilotExecute(ctx, { type: "draft_social_posts", topic: "our launch", platforms: ["LINKEDIN"], count: 2 });
    expect(await db.socialPost.count({ where: { workspaceId: ctx.workspace.id, status: "DRAFT" } })).toBeGreaterThanOrEqual(1);

    const task = await copilotExecute(ctx, { type: "assign_worker_task", workerKey: "marketing-strategist", instructions: "Audience analysis for coffee lovers in Chennai" });
    expect(task.href).toMatch(/\?task=/);
    expect((await db.aITask.findFirstOrThrow({ where: { workspaceId: ctx.workspace.id } })).capability).toBe("audience-analysis");
  });

  it("re-checks permissions when executing", async () => {
    const owner = await createOwner();
    const viewer = await addMember(owner.workspace.id, "viewer");
    await expect(copilotExecute(viewer, { type: "create_lead", firstName: "X" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("picks the best matching worker capability", () => {
    expect(pickCapability("content-writer", "write ad copy for our sale")).toBe("ad-copy");
    expect(pickCapability("content-writer", "something unrelated")).toBe("blog-post");
  });
});
