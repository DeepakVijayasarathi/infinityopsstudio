import type { Metadata } from "next";
import { requirePagePermission } from "@/server/page-context";
import { db } from "@/server/db";
import { WORKER_TEMPLATES } from "@/config/workers";
import { WorkflowBuilder } from "../workflow-builder";

export const metadata: Metadata = { title: "New automation" };

export default async function NewAutomationPage() {
  const ctx = await requirePagePermission("automations:write");
  const workers = await db.aIWorker.findMany({ where: { workspaceId: ctx.workspace.id }, select: { key: true, name: true, title: true } });
  const caps = Object.fromEntries(WORKER_TEMPLATES.map((w) => [w.key, w.capabilities.map((c) => ({ key: c.key, label: c.label }))]));
  return <WorkflowBuilder workflow={null} workers={workers} capabilities={caps} canWrite executions={[]} />;
}
