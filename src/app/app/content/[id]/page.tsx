import type { Metadata } from "next";
import { requirePagePermission } from "@/server/page-context";
import { can } from "@/server/tenant";
import { db } from "@/server/db";
import { getContent } from "@/server/services/content";
import { env } from "@/server/env";
import { ContentEditor } from "./content-editor";

export const metadata: Metadata = { title: "Edit content" };

export default async function ContentEditPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePagePermission("content:read");
  const { id } = await params;
  const [content, campaigns] = await Promise.all([
    getContent(ctx.workspace.id, id),
    db.campaign.findMany({ where: { workspaceId: ctx.workspace.id, deletedAt: null }, select: { id: true, name: true }, orderBy: { updatedAt: "desc" } }),
  ]);
  return (
    <ContentEditor
      key={content.id}
      content={JSON.parse(JSON.stringify(content))}
      campaigns={campaigns}
      shareBase={`${env().APP_URL}/share/`}
      perms={{ write: can(ctx, "content:write"), approve: can(ctx, "content:approve") }}
    />
  );
}
