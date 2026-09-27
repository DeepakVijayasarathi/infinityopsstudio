import type { Metadata } from "next";
import { requirePagePermission } from "@/server/page-context";
import { can } from "@/server/tenant";
import { db } from "@/server/db";
import { getLead } from "@/server/services/leads";
import { LeadDetail } from "./lead-detail";

export const metadata: Metadata = { title: "Lead" };

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePagePermission("leads:read");
  const { id } = await params;
  const [lead, members, campaigns] = await Promise.all([
    getLead(ctx.workspace.id, id),
    db.workspaceMember.findMany({ where: { workspaceId: ctx.workspace.id }, select: { user: { select: { id: true, name: true } } } }),
    db.campaign.findMany({ where: { workspaceId: ctx.workspace.id, deletedAt: null }, select: { id: true, name: true } }),
  ]);
  return (
    <LeadDetail
      lead={JSON.parse(JSON.stringify(lead))}
      members={members.map((m) => m.user)}
      campaigns={campaigns}
      perms={{ write: can(ctx, "leads:write"), delete: can(ctx, "leads:delete"), send: can(ctx, "email:send") }}
    />
  );
}
