import type { Metadata } from "next";
import { requirePagePermission } from "@/server/page-context";
import { can } from "@/server/tenant";
import { listWorkflows } from "@/server/services/automations";
import { getPlan } from "@/config/plans";
import { PageHeader } from "@/components/ui/page-header";
import { WorkflowList } from "./workflow-list";

export const metadata: Metadata = { title: "Automations" };

export default async function AutomationsPage() {
  const ctx = await requirePagePermission("automations:read");
  const workflows = await listWorkflows(ctx.workspace.id);
  return (
    <>
      <PageHeader title="Automations" description="Connect triggers, conditions, delays and AI actions into workflows that run on their own." />
      <WorkflowList workflows={JSON.parse(JSON.stringify(workflows))} canWrite={can(ctx, "automations:write")} limit={getPlan(ctx.plan).limits.automations} />
    </>
  );
}
