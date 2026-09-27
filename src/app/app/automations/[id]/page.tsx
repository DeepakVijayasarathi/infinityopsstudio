import type { Metadata } from "next";
import { requirePagePermission } from "@/server/page-context";
import { can } from "@/server/tenant";
import { db } from "@/server/db";
import { getWorkflow, listExecutions } from "@/server/services/automations";
import { WORKER_TEMPLATES } from "@/config/workers";
import { WorkflowBuilder } from "../workflow-builder";

export const metadata: Metadata = { title: "Automation" };

export default async function AutomationPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePagePermission("automations:read");
  const { id } = await params;
  const [workflow, executions, workers] = await Promise.all([
    getWorkflow(ctx.workspace.id, id),
    listExecutions(ctx.workspace.id, id),
    db.aIWorker.findMany({ where: { workspaceId: ctx.workspace.id }, select: { key: true, name: true, title: true } }),
  ]);
  const caps = Object.fromEntries(WORKER_TEMPLATES.map((w) => [w.key, w.capabilities.map((c) => ({ key: c.key, label: c.label }))]));
  return <WorkflowBuilder workflow={JSON.parse(JSON.stringify(workflow))} executions={JSON.parse(JSON.stringify(executions))} workers={workers} capabilities={caps} canWrite={can(ctx, "automations:write")} />;
}
