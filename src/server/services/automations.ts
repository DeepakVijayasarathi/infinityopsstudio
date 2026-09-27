import type { Prisma, WorkflowNodeType, WorkflowTrigger } from "@prisma/client";
import { ZodError } from "zod";
import { db } from "../db";
import { AppError, badRequest, notFound, paymentRequired } from "../errors";
import { audit } from "../audit";
import { randomToken } from "../crypto";
import { enqueue } from "../queue";
import { logger } from "../logger";
import type { WorkspaceContext } from "../tenant";
import { startExecution } from "./events";
import { notify } from "./notifications";
import { DELAY_MS, parseNodeConfig } from "./automation-nodes";
import { evaluateCondition, renderTemplate } from "@/lib/template";
import { generateText } from "../ai/service";
import { getWorkerTemplate } from "@/config/workers";
import { getPlan, withinLimit } from "@/config/plans";
import { sendEmail } from "../email";
import { actionEmail } from "../email/templates";
import { deliverWebhook } from "../integrations/registry";
import { integrationCredentials } from "./integrations";
import { assertPublicUrl } from "../net";
import { env } from "../env";

export type NodeInput = { type: WorkflowNodeType; label?: string; config: Record<string, unknown> };
export type WorkflowInput = { name: string; description?: string | null; trigger: WorkflowTrigger; triggerConfig?: Record<string, unknown> | null; nodes: NodeInput[] };

function validateNodes(nodes: NodeInput[]) {
  if (nodes.length > 25) throw badRequest("Workflows can have up to 25 steps");
  return nodes.map((n, i) => {
    try {
      return { type: n.type, label: n.label?.trim() || n.type, config: parseNodeConfig(n.type, n.config) as Prisma.InputJsonValue, position: i };
    } catch (err) {
      if (err instanceof ZodError) throw badRequest(`Step ${i + 1} (${n.label ?? n.type}): ${err.issues[0]?.path.join(".")} ${err.issues[0]?.message}`);
      throw err;
    }
  });
}

export async function listWorkflows(workspaceId: string) {
  return db.workflow.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { nodes: true, executions: true } }, executions: { orderBy: { startedAt: "desc" }, take: 1, select: { status: true, startedAt: true } } },
  });
}

export async function getWorkflow(workspaceId: string, id: string) {
  const wf = await db.workflow.findFirst({ where: { id, workspaceId }, include: { nodes: { orderBy: { position: "asc" } } } });
  if (!wf) throw notFound("Workflow");
  return { ...wf, webhookUrl: wf.webhookToken ? `${env().APP_URL}/api/v1/hooks/workflows/${wf.webhookToken}` : null };
}

export async function createWorkflow(ctx: WorkspaceContext, input: WorkflowInput) {
  const nodes = validateNodes(input.nodes);
  const wf = await db.workflow.create({
    data: {
      workspaceId: ctx.workspace.id,
      name: input.name,
      description: input.description,
      trigger: input.trigger,
      triggerConfig: (input.triggerConfig ?? undefined) as Prisma.InputJsonValue | undefined,
      webhookToken: input.trigger === "WEBHOOK" ? randomToken(24) : null,
      createdById: ctx.user.id,
      nodes: { create: nodes },
    },
  });
  await audit({ action: "workflow.created", workspaceId: ctx.workspace.id, actorId: ctx.user.id, entityType: "Workflow", entityId: wf.id });
  return wf;
}

export async function updateWorkflow(ctx: WorkspaceContext, id: string, input: Partial<WorkflowInput>) {
  const existing = await getWorkflow(ctx.workspace.id, id);
  const nodes = input.nodes ? validateNodes(input.nodes) : null;
  const trigger = input.trigger ?? existing.trigger;
  await db.$transaction(async (tx) => {
    await tx.workflow.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        trigger,
        ...(input.triggerConfig !== undefined ? { triggerConfig: (input.triggerConfig ?? undefined) as Prisma.InputJsonValue | undefined } : {}),
        webhookToken: trigger === "WEBHOOK" ? (existing.webhookToken ?? randomToken(24)) : null,
      },
    });
    if (nodes) {
      await tx.workflowNode.deleteMany({ where: { workflowId: id } });
      await tx.workflowNode.createMany({ data: nodes.map((n) => ({ ...n, workflowId: id })) });
    }
  });
  await audit({ action: "workflow.updated", workspaceId: ctx.workspace.id, actorId: ctx.user.id, entityType: "Workflow", entityId: id });
  return getWorkflow(ctx.workspace.id, id);
}

export async function setWorkflowEnabled(ctx: WorkspaceContext, id: string, enabled: boolean) {
  const wf = await getWorkflow(ctx.workspace.id, id);
  if (enabled && !wf.nodes.length) throw badRequest("Add at least one step before enabling the workflow");
  if (enabled && !wf.isEnabled) {
    const plan = getPlan(ctx.plan);
    const active = await db.workflow.count({ where: { workspaceId: ctx.workspace.id, isEnabled: true } });
    if (!withinLimit(plan.limits.automations, active)) throw paymentRequired(`The ${plan.name} plan includes ${plan.limits.automations} active automation(s). Upgrade to enable more.`);
  }
  await db.workflow.update({ where: { id }, data: { isEnabled: enabled } });
  await audit({ action: enabled ? "workflow.enabled" : "workflow.disabled", workspaceId: ctx.workspace.id, actorId: ctx.user.id, entityType: "Workflow", entityId: id });
}

export async function deleteWorkflow(ctx: WorkspaceContext, id: string) {
  await getWorkflow(ctx.workspace.id, id);
  await db.workflow.delete({ where: { id } });
  await audit({ action: "workflow.deleted", workspaceId: ctx.workspace.id, actorId: ctx.user.id, entityType: "Workflow", entityId: id });
}

export async function runManually(ctx: WorkspaceContext, id: string, payload: Record<string, unknown> = {}) {
  const wf = await getWorkflow(ctx.workspace.id, id);
  if (!wf.nodes.length) throw badRequest("This workflow has no steps");
  return startExecution(wf.id, ctx.workspace.id, { ...payload, triggeredBy: ctx.user.name, manual: true });
}

export async function triggerWebhook(token: string, payload: Record<string, unknown>) {
  const wf = await db.workflow.findUnique({ where: { webhookToken: token } });
  if (!wf || !wf.isEnabled || wf.trigger !== "WEBHOOK") throw notFound("Workflow");
  const exec = await startExecution(wf.id, wf.workspaceId, payload);
  return { executionId: exec.id };
}

export async function listExecutions(workspaceId: string, workflowId: string) {
  await getWorkflow(workspaceId, workflowId);
  return db.workflowExecution.findMany({ where: { workflowId, workspaceId }, orderBy: { startedAt: "desc" }, take: 50 });
}

// ─── Execution engine ───

type LogEntry = { at: string; step: number; label: string; status: "ok" | "skipped" | "waiting" | "stopped" | "error"; message: string };

type Scope = { payload: Record<string, unknown>; lead?: Record<string, unknown> | null; lastOutput?: string; workspace: { id: string; name: string } };

async function loadScope(workspaceId: string, payload: Record<string, unknown>, context: Record<string, unknown>): Promise<Scope> {
  const workspace = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { id: true, name: true } });
  const leadId = typeof payload.leadId === "string" ? payload.leadId : null;
  const lead = leadId ? await db.lead.findFirst({ where: { id: leadId, workspaceId } }) : null;
  return { payload, lead: lead as unknown as Record<string, unknown> | null, lastOutput: context.lastOutput as string | undefined, workspace };
}

async function runNode(workspaceId: string, workflowId: string, type: WorkflowNodeType, rawConfig: unknown, scope: Scope): Promise<{ message: string; stop?: boolean; delayMs?: number }> {
  const config = parseNodeConfig(type, rawConfig);
  const t = (s: string) => renderTemplate(s, scope as unknown as Record<string, unknown>);

  switch (type) {
    case "CONDITION": {
      const passed = evaluateCondition(scope as unknown as Record<string, unknown>, config.field, config.operator, config.value);
      return { message: `${config.field} ${config.operator} ${config.value ?? ""} → ${passed ? "true" : "false"}`, stop: !passed };
    }
    case "DELAY":
      return { message: `Waiting ${config.amount} ${config.unit}`, delayMs: config.amount * DELAY_MS[config.unit as keyof typeof DELAY_MS] };
    case "AI_ACTION": {
      const worker = await db.aIWorker.findFirst({ where: { workspaceId, key: config.workerKey } });
      const cap = getWorkerTemplate(config.workerKey)?.capabilities.find((c) => c.key === config.capability);
      if (!worker || !cap) throw new Error("AI worker or capability not found");
      const result = await generateText({
        workspaceId,
        feature: `workflow:${config.workerKey}:${config.capability}`,
        system: worker.systemPrompt,
        messages: [{ role: "user", content: cap.prompt.replace("{{input}}", t(config.instructions)) }],
        model: worker.model,
      });
      scope.lastOutput = result.text;
      if (config.saveAsContent) {
        await db.content.create({ data: { workspaceId, title: `${cap.label} (automation)`, type: "OTHER", body: result.text, generatedByAI: true, wordCount: result.text.split(/\s+/).length } });
      }
      return { message: `${worker.name} generated ${result.completionTokens} tokens` };
    }
    case "ASSIGN_WORKER": {
      const worker = await db.aIWorker.findFirst({ where: { workspaceId, key: config.workerKey } });
      if (!worker) throw new Error("AI worker not found");
      const task = await db.aITask.create({ data: { workspaceId, workerId: worker.id, title: `Automation: ${t(config.instructions).slice(0, 60)}`, capability: config.capability, instructions: t(config.instructions) } });
      await enqueue("ai", { kind: "run-task", taskId: task.id });
      return { message: `Task assigned to ${worker.name}` };
    }
    case "SEND_EMAIL": {
      let to: string | null | undefined = null;
      if (config.to === "lead") to = (scope.lead?.email as string | null) ?? null;
      else if (config.to === "custom") to = config.email;
      else if (scope.lead?.ownerId) to = (await db.user.findUnique({ where: { id: scope.lead.ownerId as string } }))?.email;
      if (!to) return { message: "No recipient email available — skipped" };
      if (config.to === "lead" && scope.lead?.unsubscribedAt) return { message: "Lead is unsubscribed — skipped" };
      const body = t(config.body);
      await sendEmail({ to, subject: t(config.subject), text: body, html: actionEmail({ title: t(config.subject), intro: body, actionUrl: env().APP_URL, actionLabel: `Visit ${scope.workspace.name}` }).html });
      if (scope.lead?.id) await db.leadActivity.create({ data: { workspaceId, leadId: scope.lead.id as string, type: "EMAIL_SENT", content: `Automation email: ${t(config.subject)}` } });
      return { message: `Email sent to ${to}` };
    }
    case "CREATE_SOCIAL_POST": {
      const text = t(config.text).slice(0, 5000);
      const account = await db.socialAccount.findFirst({ where: { workspaceId, platform: config.platform } });
      const scheduledAt = config.scheduleInHours > 0 ? new Date(Date.now() + config.scheduleInHours * 3_600_000) : null;
      await db.socialPost.create({ data: { workspaceId, platform: config.platform, socialAccountId: account?.id, text, status: scheduledAt && account ? "PENDING_APPROVAL" : "DRAFT", scheduledAt } });
      return { message: `${config.platform} post created ${scheduledAt ? "for approval" : "as draft"}` };
    }
    case "UPDATE_LEAD": {
      if (!scope.lead) return { message: "No lead in context — skipped" };
      const lead = scope.lead as { id: string; tags: string[]; score: number; status: string };
      await db.lead.update({
        where: { id: lead.id },
        data: {
          ...(config.status ? { status: config.status } : {}),
          ...(config.addTag ? { tags: [...new Set([...lead.tags, config.addTag])] } : {}),
          ...(config.scoreDelta ? { score: Math.max(0, Math.min(100, lead.score + config.scoreDelta)) } : {}),
        },
      });
      await db.leadActivity.create({ data: { workspaceId, leadId: lead.id, type: "WORKFLOW", content: `Updated by automation${config.status ? ` → ${config.status}` : ""}` } });
      return { message: "Lead updated" };
    }
    case "WEBHOOK": {
      let url = config.url;
      let secret: string | undefined;
      if (config.useIntegration) {
        const integ = await integrationCredentials(workspaceId, "webhook");
        if (!integ) throw new Error("Outgoing webhook integration is not connected");
        url = integ.config.url;
        secret = integ.credentials.secret;
      }
      if (!url) throw new Error("Webhook URL is missing");
      await assertPublicUrl(url);
      const res = await deliverWebhook(url, secret, { event: "workflow.step", workflowId, payload: scope.payload, lead: scope.lead ?? null, output: scope.lastOutput ?? null });
      if (!res.ok) throw new Error(`Webhook responded with HTTP ${res.status}`);
      return { message: `Delivered (HTTP ${res.status})` };
    }
    case "NOTIFY": {
      const n = await notify({ workspaceId, type: "ai_task.completed", title: t(config.title), body: t(config.body), link: `/app/automations/${workflowId}` });
      return { message: `Notified ${n} teammate(s)` };
    }
    case "GENERATE_REPORT": {
      const { generateReportContent } = await import("./reports");
      const content = await generateReportContent(workspaceId, config.days, typeof scope.payload.campaignId === "string" ? scope.payload.campaignId : undefined);
      return { message: `Report “${content.title}” created` };
    }
  }
}

/** Runs (or resumes) a workflow execution. Invoked by the `workflows` queue. */
export async function runExecution(executionId: string) {
  const exec = await db.workflowExecution.findUnique({ where: { id: executionId }, include: { workflow: { include: { nodes: { orderBy: { position: "asc" } } } } } });
  if (!exec || ["COMPLETED", "FAILED", "STOPPED"].includes(exec.status)) return;
  if (exec.status === "WAITING" && exec.resumeAt && exec.resumeAt > new Date()) return;

  const logs = (exec.logs as LogEntry[]) ?? [];
  const context = (exec.context ?? {}) as Record<string, unknown>;
  const scope = await loadScope(exec.workspaceId, (exec.payload ?? {}) as Record<string, unknown>, context);
  const nodes = exec.workflow.nodes;
  await db.workflowExecution.update({ where: { id: exec.id }, data: { status: "RUNNING" } });

  for (let i = exec.currentStep; i < nodes.length; i++) {
    const node = nodes[i]!;
    try {
      const outcome = await runNode(exec.workspaceId, exec.workflowId, node.type, node.config, scope);
      if (outcome.delayMs) {
        const resumeAt = new Date(Date.now() + outcome.delayMs);
        logs.push({ at: new Date().toISOString(), step: i + 1, label: node.label, status: "waiting", message: outcome.message });
        await db.workflowExecution.update({
          where: { id: exec.id },
          data: { status: "WAITING", resumeAt, currentStep: i + 1, logs: logs as unknown as Prisma.InputJsonValue, context: { lastOutput: scope.lastOutput ?? null } },
        });
        await enqueue("workflows", { kind: "run-execution", executionId: exec.id }, { delay: outcome.delayMs, jobId: `${exec.id}-${i + 1}` });
        return;
      }
      logs.push({ at: new Date().toISOString(), step: i + 1, label: node.label, status: outcome.stop ? "stopped" : "ok", message: outcome.message });
      if (outcome.stop) {
        await db.workflowExecution.update({ where: { id: exec.id }, data: { status: "STOPPED", currentStep: i + 1, logs: logs as unknown as Prisma.InputJsonValue, finishedAt: new Date() } });
        return;
      }
    } catch (err) {
      const message = err instanceof AppError || err instanceof Error ? err.message : "Step failed";
      logs.push({ at: new Date().toISOString(), step: i + 1, label: node.label, status: "error", message });
      await db.workflowExecution.update({ where: { id: exec.id }, data: { status: "FAILED", error: message, currentStep: i, logs: logs as unknown as Prisma.InputJsonValue, finishedAt: new Date() } });
      logger.warn("Workflow step failed", { executionId: exec.id, step: i + 1, err });
      await notify({ workspaceId: exec.workspaceId, type: "workflow.failed", title: `Workflow “${exec.workflow.name}” failed at step ${i + 1}`, body: message, link: `/app/automations/${exec.workflowId}`, permission: "automations:write" });
      return;
    }
  }
  await db.workflowExecution.update({ where: { id: exec.id }, data: { status: "COMPLETED", currentStep: nodes.length, logs: logs as unknown as Prisma.InputJsonValue, finishedAt: new Date(), context: { lastOutput: scope.lastOutput ?? null } } });
}

/** Scheduler: fire SCHEDULE workflows whose interval elapsed, and resume overdue waits. */
export async function processScheduledWorkflows() {
  const scheduled = await db.workflow.findMany({ where: { trigger: "SCHEDULE", isEnabled: true } });
  let started = 0;
  for (const wf of scheduled) {
    const hours = Number((wf.triggerConfig as { intervalHours?: number } | null)?.intervalHours ?? 24);
    if (!wf.lastRunAt || Date.now() - wf.lastRunAt.getTime() >= hours * 3_600_000) {
      await startExecution(wf.id, wf.workspaceId, { scheduled: true });
      started++;
    }
  }
  const overdue = await db.workflowExecution.findMany({ where: { status: "WAITING", resumeAt: { lte: new Date(Date.now() - 60_000) } }, select: { id: true }, take: 100 });
  for (const e of overdue) await enqueue("workflows", { kind: "run-execution", executionId: e.id });
  return { started, resumed: overdue.length };
}
