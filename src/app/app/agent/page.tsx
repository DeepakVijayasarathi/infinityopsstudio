import type { Metadata } from "next";
import { requirePagePermission } from "@/server/page-context";
import { can } from "@/server/tenant";
import { agentOverview } from "@/server/services/agent";
import { PageHeader } from "@/components/ui/page-header";
import { AgentView } from "./agent-view";

export const metadata: Metadata = { title: "AI Manager" };

export default async function AgentPage() {
  const ctx = await requirePagePermission("campaigns:read");
  const overview = await agentOverview(ctx.workspace.id);
  return (
    <>
      <PageHeader title="AI Manager" description="Every morning it reviews your marketing, writes a brief and lines up the next moves. You approve — it does the work." />
      <AgentView initial={JSON.parse(JSON.stringify(overview))} canConfigure={can(ctx, "campaigns:write")} canDecide={can(ctx, "content:write")} timezone={ctx.workspace.timezone} />
    </>
  );
}
