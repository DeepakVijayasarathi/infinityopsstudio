import type { Metadata } from "next";
import { z } from "zod";
import { requirePagePermission } from "@/server/page-context";
import { can } from "@/server/tenant";
import { db } from "@/server/db";
import { paginationSchema } from "@/server/pagination";
import { listLeads, pipeline } from "@/server/services/leads";
import { LEAD_SOURCES, LEAD_STATUSES } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { LeadsView } from "./leads-view";

export const metadata: Metadata = { title: "Leads" };

const q = paginationSchema.extend({
  status: z.enum(LEAD_STATUSES).optional().catch(undefined),
  source: z.enum(LEAD_SOURCES).optional().catch(undefined),
  minScore: z.coerce.number().int().min(0).max(100).optional().catch(undefined),
  view: z.enum(["list", "pipeline"]).optional().catch(undefined),
  new: z.string().optional(),
});

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requirePagePermission("leads:read");
  const params = q.parse(await searchParams);
  const view = params.view ?? "list";
  const [data, board, members, campaigns] = await Promise.all([
    view === "list" ? listLeads(ctx.workspace.id, { ...params, sort: params.sort ?? "createdAt" }) : null,
    view === "pipeline" ? pipeline(ctx.workspace.id) : null,
    db.workspaceMember.findMany({ where: { workspaceId: ctx.workspace.id }, select: { user: { select: { id: true, name: true } } } }),
    db.campaign.findMany({ where: { workspaceId: ctx.workspace.id, deletedAt: null }, select: { id: true, name: true } }),
  ]);
  return (
    <>
      <PageHeader title="Leads" description="Every contact, score, conversation and deal stage in one place." />
      <LeadsView
        view={view}
        data={data ? JSON.parse(JSON.stringify(data)) : null}
        board={board ? JSON.parse(JSON.stringify(board)) : null}
        members={members.map((m) => m.user)}
        campaigns={campaigns}
        openNew={params.new === "1"}
        perms={{ write: can(ctx, "leads:write"), delete: can(ctx, "leads:delete") }}
      />
    </>
  );
}
