import type { Metadata } from "next";
import { requirePagePermission } from "@/server/page-context";
import { can } from "@/server/tenant";
import { db } from "@/server/db";
import { getWorker, listTasks } from "@/server/services/workers";
import { WorkerDetail } from "./worker-detail";

export const metadata: Metadata = { title: "AI Worker" };

export default async function WorkerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ task?: string }> }) {
  const ctx = await requirePagePermission("workers:read");
  const { id } = await params;
  const [worker, tasks, campaigns] = await Promise.all([
    getWorker(ctx.workspace.id, id),
    listTasks(ctx.workspace.id, { page: 1, pageSize: 50, order: "desc", workerId: id }),
    db.campaign.findMany({ where: { workspaceId: ctx.workspace.id, deletedAt: null, status: { notIn: ["ARCHIVED", "COMPLETED"] } }, select: { id: true, name: true }, orderBy: { updatedAt: "desc" } }),
  ]);
  const { task } = await searchParams;
  return (
    <WorkerDetail
      worker={JSON.parse(JSON.stringify(worker))}
      tasks={JSON.parse(JSON.stringify(tasks.items))}
      campaigns={campaigns}
      canRun={can(ctx, "workers:run")}
      canManage={can(ctx, "workers:manage")}
      openTaskId={task ?? null}
    />
  );
}
