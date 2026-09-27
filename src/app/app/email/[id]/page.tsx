import type { Metadata } from "next";
import { requirePagePermission } from "@/server/page-context";
import { can } from "@/server/tenant";
import { db } from "@/server/db";
import { getEmailCampaign } from "@/server/services/email";
import { EmailEditor } from "./email-editor";

export const metadata: Metadata = { title: "Email campaign" };

export default async function EmailCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePagePermission("email:read");
  const { id } = await params;
  const [campaign, tags, campaigns] = await Promise.all([
    getEmailCampaign(ctx.workspace.id, id),
    db.$queryRaw<{ tag: string }[]>`SELECT DISTINCT unnest(tags) AS tag FROM "Lead" WHERE "workspaceId" = ${ctx.workspace.id} AND "deletedAt" IS NULL ORDER BY 1 LIMIT 100`,
    db.campaign.findMany({ where: { workspaceId: ctx.workspace.id, deletedAt: null }, select: { id: true, name: true } }),
  ]);
  return <EmailEditor campaign={JSON.parse(JSON.stringify(campaign))} tags={tags.map((t) => t.tag)} campaigns={campaigns} perms={{ write: can(ctx, "email:write"), send: can(ctx, "email:send") }} />;
}
