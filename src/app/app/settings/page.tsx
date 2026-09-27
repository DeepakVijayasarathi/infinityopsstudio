import type { Metadata } from "next";
import { requireContext } from "@/server/page-context";
import { can } from "@/server/tenant";
import { db } from "@/server/db";
import { WorkspaceSettings } from "./workspace-settings";

export const metadata: Metadata = { title: "Workspace settings" };

export default async function SettingsPage() {
  const ctx = await requireContext();
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: ctx.workspace.id }, select: { id: true, name: true, slug: true, industry: true, website: true, timezone: true, createdAt: true } });
  return <WorkspaceSettings workspace={JSON.parse(JSON.stringify(ws))} canManage={can(ctx, "workspace:manage")} canDelete={can(ctx, "workspace:delete")} />;
}
