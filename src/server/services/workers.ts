import type { AITaskStatus, Prisma } from "@prisma/client";
import { db } from "../db";
import { AppError, badRequest, notFound, paymentRequired } from "../errors";
import { audit } from "../audit";
import { enqueue } from "../queue";
import { generateText, streamText } from "../ai/service";
import type { WorkspaceContext } from "../tenant";
import { notify } from "./notifications";
import { getWorkerTemplate, type WorkerCapability } from "@/config/workers";
import { getPlan, withinLimit } from "@/config/plans";
import { paginated, pageArgs, type PaginationInput } from "../pagination";

export async function listWorkers(workspaceId: string) {
  const workers = await db.aIWorker.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } });
  const stats = await db.aITask.groupBy({ by: ["workerId", "status"], where: { workspaceId }, _count: true });
  return workers.map((w) => {
    const mine = stats.filter((s) => s.workerId === w.id);
    const count = (st: AITaskStatus[]) => mine.filter((s) => st.includes(s.status)).reduce((a, s) => a + s._count, 0);
    return {
      ...w,
      template: getWorkerTemplate(w.key),
      stats: {
        total: mine.reduce((a, s) => a + s._count, 0),
        completed: count(["COMPLETED", "APPROVED"]),
        pending: count(["QUEUED", "RUNNING", "AWAITING_APPROVAL"]),
        failed: count(["FAILED"]),
      },
    };
  });
}

export async function getWorker(workspaceId: string, id: string) {
  const worker = await db.aIWorker.findFirst({ where: { id, workspaceId } });
  if (!worker) throw notFound("AI worker");
  const [usage, recentTasks] = await Promise.all([
    db.aITask.aggregate({ where: { workerId: id, workspaceId }, _sum: { promptTokens: true, completionTokens: true, costMicros: true }, _count: true }),
    db.aITask.count({ where: { workerId: id, workspaceId, createdAt: { gte: new Date(Date.now() - 30 * 86400_000) } } }),
  ]);
  return {
    ...worker,
    template: getWorkerTemplate(worker.key),
    usage: {
      tasks: usage._count,
      tasksLast30d: recentTasks,
      tokens: (usage._sum.promptTokens ?? 0) + (usage._sum.completionTokens ?? 0),
      costMicros: usage._sum.costMicros ?? 0,
    },
  };
}

export async function updateWorker(
  ctx: WorkspaceContext,
  id: string,
  data: { customInstructions?: string | null; model?: string | null; temperature?: number; requiresApproval?: boolean; isActive?: boolean },
) {
  const worker = await db.aIWorker.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!worker) throw notFound("AI worker");
  if (data.isActive && !worker.isActive) {
    const plan = getPlan(ctx.plan);
    const active = await db.aIWorker.count({ where: { workspaceId: ctx.workspace.id, isActive: true } });
    if (!withinLimit(plan.limits.activeWorkers, active)) {
      throw paymentRequired(`The ${plan.name} plan includes ${plan.limits.activeWorkers} active AI workers. Upgrade to activate more.`);
    }
  }
  const updated = await db.aIWorker.update({ where: { id }, data });
  await audit({ action: "worker.updated", workspaceId: ctx.workspace.id, actorId: ctx.user.id, entityType: "AIWorker", entityId: id, metadata: data });
  return updated;
}

function capabilityFor(workerKey: string, capability: string): WorkerCapability {
  const cap = getWorkerTemplate(workerKey)?.capabilities.find((c) => c.key === capability);
  if (!cap) throw badRequest("This worker does not have that capability");
  return cap;
}

export async function createTask(
  ctx: WorkspaceContext,
  workerId: string,
  input: { capability: string; instructions: string; title?: string; campaignId?: string | null; context?: string },
) {
  const worker = await db.aIWorker.findFirst({ where: { id: workerId, workspaceId: ctx.workspace.id } });
  if (!worker) throw notFound("AI worker");
  if (!worker.isActive) throw badRequest(`${worker.name} is not active. Activate the worker to assign tasks.`);
  const cap = capabilityFor(worker.key, input.capability);
  if (input.campaignId) {
    const campaign = await db.campaign.findFirst({ where: { id: input.campaignId, workspaceId: ctx.workspace.id, deletedAt: null } });
    if (!campaign) throw notFound("Campaign");
  }
  const task = await db.aITask.create({
    data: {
      workspaceId: ctx.workspace.id,
      workerId,
      createdById: ctx.user.id,
      campaignId: input.campaignId ?? null,
      title: input.title?.trim() || `${cap.label}: ${input.instructions.slice(0, 60)}`,
      capability: cap.key,
      instructions: input.instructions,
      input: input.context ? { context: input.context } : undefined,
    },
  });
  await enqueue("ai", { kind: "run-task", taskId: task.id });
  await audit({ action: "worker.task_created", workspaceId: ctx.workspace.id, actorId: ctx.user.id, entityType: "AITask", entityId: task.id });
  return task;
}

/** Executes an AI task (called by the background worker). */
export async function runTask(taskId: string) {
  const task = await db.aITask.findUnique({ where: { id: taskId }, include: { worker: true, campaign: true } });
  if (!task || ["COMPLETED", "APPROVED", "REJECTED", "CANCELLED", "AWAITING_APPROVAL"].includes(task.status)) return;

  await db.aITask.update({ where: { id: taskId }, data: { status: "RUNNING", startedAt: new Date(), attempts: { increment: 1 }, error: null } });
  const cap = capabilityFor(task.worker.key, task.capability);
  const extra = (task.input as { context?: string } | null)?.context;
  const campaignCtx = task.campaign
    ? `\n\nCampaign context:\nName: ${task.campaign.name}\nObjective: ${task.campaign.objective}\nAudience: ${task.campaign.targetAudience ?? "n/a"}\nChannels: ${task.campaign.channels.join(", ")}`
    : "";
  const system = `${task.worker.systemPrompt}${task.worker.customInstructions ? `\n\nWorkspace instructions for you:\n${task.worker.customInstructions}` : ""}`;
  const prompt = `${cap.prompt.replace("{{input}}", task.instructions)}${campaignCtx}${extra ? `\n\nAdditional context:\n${extra}` : ""}`;

  try {
    const result = await generateText({
      workspaceId: task.workspaceId,
      userId: task.createdById,
      taskId: task.id,
      feature: `worker:${task.worker.key}:${task.capability}`,
      system,
      messages: [{ role: "user", content: prompt }],
      model: task.worker.model,
      temperature: task.worker.temperature,
    });
    const status: AITaskStatus = task.worker.requiresApproval ? "AWAITING_APPROVAL" : "COMPLETED";
    await db.aITask.update({
      where: { id: taskId },
      data: {
        status,
        output: result.text,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        costMicros: result.costMicros,
        model: result.model,
        provider: result.provider,
        completedAt: new Date(),
      },
    });
    if (status === "AWAITING_APPROVAL") {
      await notify({
        workspaceId: task.workspaceId,
        type: "ai_task.approval",
        title: `${task.worker.name} finished “${task.title}” — review needed`,
        body: "Approve or reject the output to complete the task.",
        link: `/app/workers/${task.workerId}?task=${task.id}`,
        permission: "tasks:approve",
      });
    } else if (task.createdById) {
      await notify({
        workspaceId: task.workspaceId,
        type: "ai_task.completed",
        title: `${task.worker.name} completed “${task.title}”`,
        link: `/app/workers/${task.workerId}?task=${task.id}`,
        userIds: [task.createdById],
      });
    }
  } catch (err) {
    const message = err instanceof AppError ? err.message : "The AI provider failed to complete this task";
    await db.aITask.update({ where: { id: taskId }, data: { status: "FAILED", error: message, completedAt: new Date() } });
    if (task.createdById) {
      await notify({ workspaceId: task.workspaceId, type: "ai_task.completed", title: `“${task.title}” failed`, body: message, link: `/app/workers/${task.workerId}?task=${task.id}`, userIds: [task.createdById] });
    }
  }
}

export async function listTasks(workspaceId: string, filters: PaginationInput & { workerId?: string; status?: AITaskStatus; campaignId?: string }) {
  const where: Prisma.AITaskWhereInput = {
    workspaceId,
    ...(filters.workerId ? { workerId: filters.workerId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
    ...(filters.q ? { OR: [{ title: { contains: filters.q, mode: "insensitive" } }, { instructions: { contains: filters.q, mode: "insensitive" } }] } : {}),
  };
  const [items, total] = await Promise.all([
    db.aITask.findMany({
      where,
      include: { worker: { select: { id: true, name: true, title: true, color: true, key: true } }, createdBy: { select: { name: true } }, approvedBy: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      ...pageArgs(filters),
    }),
    db.aITask.count({ where }),
  ]);
  return paginated(items, total, filters);
}

export async function getTask(workspaceId: string, id: string) {
  const task = await db.aITask.findFirst({
    where: { id, workspaceId },
    include: { worker: { select: { id: true, name: true, title: true, color: true, key: true } }, createdBy: { select: { name: true } }, approvedBy: { select: { name: true } }, campaign: { select: { id: true, name: true } } },
  });
  if (!task) throw notFound("Task");
  return task;
}

export async function reviewTask(ctx: WorkspaceContext, id: string, decision: "approve" | "reject", note?: string, editedOutput?: string) {
  const task = await getTask(ctx.workspace.id, id);
  if (task.status !== "AWAITING_APPROVAL") throw badRequest("Only tasks awaiting approval can be reviewed");
  const updated = await db.aITask.update({
    where: { id },
    data: {
      status: decision === "approve" ? "APPROVED" : "REJECTED",
      approvedById: ctx.user.id,
      approvedAt: new Date(),
      reviewNote: note,
      ...(editedOutput !== undefined ? { output: editedOutput } : {}),
    },
  });
  await audit({ action: `worker.task_${decision === "approve" ? "approved" : "rejected"}`, workspaceId: ctx.workspace.id, actorId: ctx.user.id, entityType: "AITask", entityId: id });
  return updated;
}

export async function retryTask(ctx: WorkspaceContext, id: string) {
  const task = await getTask(ctx.workspace.id, id);
  if (!["FAILED", "REJECTED", "CANCELLED"].includes(task.status)) throw badRequest("Only failed, rejected or cancelled tasks can be retried");
  await db.aITask.update({ where: { id }, data: { status: "QUEUED", error: null, output: null, approvedAt: null, approvedById: null, reviewNote: null } });
  await enqueue("ai", { kind: "run-task", taskId: id });
}

export async function cancelTask(ctx: WorkspaceContext, id: string) {
  const task = await getTask(ctx.workspace.id, id);
  if (task.status !== "QUEUED") throw badRequest("Only queued tasks can be cancelled");
  await db.aITask.update({ where: { id }, data: { status: "CANCELLED", completedAt: new Date() } });
}

/** Saves an approved/completed task output into the Content library. */
export async function saveTaskAsContent(ctx: WorkspaceContext, id: string) {
  const task = await getTask(ctx.workspace.id, id);
  if (!task.output) throw badRequest("This task has no output yet");
  const type = task.capability.includes("blog") ? "BLOG_POST" : task.capability.includes("email") || task.capability.includes("sequence") ? "EMAIL" : task.capability.includes("ad") ? "AD_COPY" : task.capability.includes("social") || task.capability.includes("post") ? "SOCIAL_POST" : "OTHER";
  const content = await db.content.create({
    data: {
      workspaceId: ctx.workspace.id,
      authorId: ctx.user.id,
      campaignId: task.campaignId,
      title: task.title,
      type,
      body: task.output,
      generatedByAI: true,
      wordCount: task.output.split(/\s+/).filter(Boolean).length,
      versions: { create: { version: 1, title: task.title, body: task.output, note: `Generated by ${task.worker.name}`, createdById: ctx.user.id } },
    },
  });
  return content;
}

// ─── Conversations (chat with a worker) ───

export async function listConversations(ctx: WorkspaceContext, workerId: string) {
  return db.aIConversation.findMany({
    where: { workspaceId: ctx.workspace.id, workerId, userId: ctx.user.id },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: { id: true, title: true, updatedAt: true },
  });
}

export async function getConversation(ctx: WorkspaceContext, id: string) {
  const convo = await db.aIConversation.findFirst({
    where: { id, workspaceId: ctx.workspace.id, userId: ctx.user.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!convo) throw notFound("Conversation");
  return convo;
}

export async function chatWithWorker(ctx: WorkspaceContext, workerId: string, message: string, conversationId?: string | null) {
  const worker = await db.aIWorker.findFirst({ where: { id: workerId, workspaceId: ctx.workspace.id } });
  if (!worker) throw notFound("AI worker");
  if (!worker.isActive) throw badRequest(`${worker.name} is not active`);

  const convo = conversationId
    ? await getConversation(ctx, conversationId)
    : await db.aIConversation.create({
        data: { workspaceId: ctx.workspace.id, userId: ctx.user.id, workerId, title: message.slice(0, 80) },
        include: { messages: true },
      });

  await db.aIMessage.create({ data: { conversationId: convo.id, role: "user", content: message } });
  const history = [...convo.messages.slice(-20).map((m) => ({ role: m.role as "user" | "assistant", content: m.content })), { role: "user" as const, content: message }];

  const stream = await streamText(
    {
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      feature: `worker-chat:${worker.key}`,
      system: `${worker.systemPrompt}${worker.customInstructions ? `\n\nWorkspace instructions:\n${worker.customInstructions}` : ""}`,
      messages: history,
      model: worker.model,
      temperature: worker.temperature,
    },
    async (text, result) => {
      await db.aIMessage.create({ data: { conversationId: convo.id, role: "assistant", content: text, tokens: result.completionTokens } });
      await db.aIConversation.update({ where: { id: convo.id }, data: { updatedAt: new Date() } });
    },
  );
  return { stream, conversationId: convo.id };
}
