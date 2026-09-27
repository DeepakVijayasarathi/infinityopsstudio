import type { Prisma, WorkflowTrigger } from "@prisma/client";
import { db } from "../db";
import { enqueue } from "../queue";
import { logger } from "../logger";

/**
 * Domain event bus for automations: finds enabled workflows listening to `trigger`,
 * checks trigger filters and starts an execution for each (processed by the worker).
 */
export async function emitEvent(workspaceId: string, trigger: WorkflowTrigger, payload: Record<string, unknown>) {
  try {
    const workflows = await db.workflow.findMany({ where: { workspaceId, trigger, isEnabled: true } });
    for (const wf of workflows) {
      const filter = (wf.triggerConfig ?? {}) as { status?: string; source?: string };
      if (filter.status && payload.status && filter.status !== payload.status) continue;
      if (filter.source && payload.source && filter.source !== payload.source) continue;
      await startExecution(wf.id, workspaceId, payload);
    }
  } catch (err) {
    logger.error("Failed to emit workflow event", { err, trigger, workspaceId });
  }
}

export async function startExecution(workflowId: string, workspaceId: string, payload: Record<string, unknown>) {
  const execution = await db.workflowExecution.create({
    data: { workflowId, workspaceId, payload: payload as Prisma.InputJsonValue, status: "RUNNING", logs: [] },
  });
  await db.workflow.update({ where: { id: workflowId }, data: { runCount: { increment: 1 }, lastRunAt: new Date() } });
  await enqueue("workflows", { kind: "run-execution", executionId: execution.id });
  return execution;
}
