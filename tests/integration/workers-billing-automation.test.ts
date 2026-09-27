import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createTask, reviewTask, saveTaskAsContent } from "@/server/services/workers";
import { changePlan } from "@/server/billing/service";
import { createWorkflow, setWorkflowEnabled } from "@/server/services/automations";
import { createLead } from "@/server/services/leads";
import { contextFor, createOwner, resetDb } from "../helpers/factory";

beforeEach(resetDb);

describe("AI workers", () => {
  it("runs a task through the queue and records usage", async () => {
    const ctx = await createOwner();
    const worker = await db.aIWorker.findFirstOrThrow({ where: { workspaceId: ctx.workspace.id, key: "content-writer" } });
    const task = await createTask(ctx, worker.id, { capability: "blog-post", instructions: "Topic: How route optimization cuts fuel costs" });

    const done = await db.aITask.findUniqueOrThrow({ where: { id: task.id } });
    expect(done.status).toBe("AWAITING_APPROVAL");
    expect(done.output).toMatch(/route optimization/i);
    expect(await db.aIRequest.count({ where: { workspaceId: ctx.workspace.id, status: "SUCCESS" } })).toBe(1);
    const usage = await db.usageRecord.aggregate({ where: { workspaceId: ctx.workspace.id, metric: "AI_CREDITS" }, _sum: { quantity: true } });
    expect(usage._sum.quantity).toBeGreaterThan(0);

    const approved = await reviewTask(ctx, task.id, "approve", "Looks good");
    expect(approved.status).toBe("APPROVED");
    const content = await saveTaskAsContent(ctx, task.id);
    expect(content.generatedByAI).toBe(true);
  });

  it("refuses tasks for inactive workers", async () => {
    const ctx = await createOwner();
    const inactive = await db.aIWorker.findFirstOrThrow({ where: { workspaceId: ctx.workspace.id, isActive: false } });
    await expect(createTask(ctx, inactive.id, { capability: "x", instructions: "Do something useful" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("billing", () => {
  it("applies upgrades immediately with an invoice and schedules downgrades", async () => {
    let ctx = await createOwner();
    await expect(changePlan(ctx, "GROWTH", "MONTHLY")).resolves.toEqual({ type: "applied" });
    const sub = await db.subscription.findUniqueOrThrow({ where: { workspaceId: ctx.workspace.id } });
    expect(sub.plan).toBe("GROWTH");
    expect(await db.invoice.count({ where: { workspaceId: ctx.workspace.id } })).toBe(1);

    ctx = await contextFor(ctx.user.id);
    const down = await changePlan(ctx, "STARTER", "MONTHLY");
    expect(down.type).toBe("scheduled");
    expect((await db.subscription.findUniqueOrThrow({ where: { workspaceId: ctx.workspace.id } })).pendingPlan).toBe("STARTER");
  });
});

describe("automation engine", () => {
  it("runs matching steps when a lead is created", async () => {
    const ctx = await createOwner();
    const wf = await createWorkflow(ctx, {
      name: "Tag enterprise leads",
      trigger: "LEAD_CREATED",
      nodes: [
        { type: "CONDITION", config: { field: "lead.company", operator: "exists" } },
        { type: "UPDATE_LEAD", config: { addTag: "enterprise", scoreDelta: 10, status: "CONTACTED" } },
      ],
    });
    await setWorkflowEnabled(ctx, wf.id, true);

    const withCompany = await createLead(ctx, { firstName: "Dana", email: "dana@bluepeak.com", company: "BluePeak" });
    const withoutCompany = await createLead(ctx, { firstName: "Solo", email: "solo@gmail.com" });

    const tagged = await db.lead.findUniqueOrThrow({ where: { id: withCompany.id } });
    expect(tagged.tags).toContain("enterprise");
    expect(tagged.status).toBe("CONTACTED");
    expect(tagged.score).toBe(withCompany.score + 10);
    expect((await db.lead.findUniqueOrThrow({ where: { id: withoutCompany.id } })).tags).toEqual([]);

    const executions = await db.workflowExecution.findMany({ where: { workflowId: wf.id } });
    // The lead without a company stops at the condition step.
    expect(executions.map((e) => e.status).sort()).toEqual(["COMPLETED", "STOPPED"]);
  });
});
