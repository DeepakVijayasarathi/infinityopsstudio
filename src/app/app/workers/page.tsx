import type { Metadata } from "next";
import { requirePagePermission } from "@/server/page-context";
import { listTasks, listWorkers } from "@/server/services/workers";
import { can } from "@/server/tenant";
import { getPlan } from "@/config/plans";
import { PageHeader } from "@/components/ui/page-header";
import { WorkersView } from "./workers-view";

export const metadata: Metadata = { title: "AI Workers" };

export default async function WorkersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requirePagePermission("workers:read");
  const [workers, approvals, recent] = await Promise.all([
    listWorkers(ctx.workspace.id),
    listTasks(ctx.workspace.id, { page: 1, pageSize: 50, order: "desc", status: "AWAITING_APPROVAL" }),
    listTasks(ctx.workspace.id, { page: 1, pageSize: 20, order: "desc" }),
  ]);
  const { tab } = await searchParams;
  return (
    <>
      <PageHeader title="AI Workers" description="Specialized AI marketers that use your Brand Kit. Assign tasks, review output and track usage." />
      <WorkersView
        initialTab={tab === "approvals" ? "approvals" : tab === "activity" ? "activity" : "roster"}
        workers={JSON.parse(JSON.stringify(workers))}
        approvals={JSON.parse(JSON.stringify(approvals.items))}
        recent={JSON.parse(JSON.stringify(recent.items))}
        canManage={can(ctx, "workers:manage")}
        activeLimit={getPlan(ctx.plan).limits.activeWorkers}
      />
    </>
  );
}
