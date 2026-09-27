import type { Metadata } from "next";
import { requirePagePermission } from "@/server/page-context";
import { can } from "@/server/tenant";
import { db } from "@/server/db";
import { listPages } from "@/server/services/landing-pages";
import { PageHeader } from "@/components/ui/page-header";
import { PagesView } from "./pages-view";

export const metadata: Metadata = { title: "Landing pages" };

export default async function PagesPage() {
  const ctx = await requirePagePermission("content:read");
  const [pages, campaigns] = await Promise.all([
    listPages(ctx.workspace.id),
    db.campaign.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, name: true } }),
  ]);
  return (
    <>
      <PageHeader title="Landing pages" description="Describe an offer — AI writes a hosted page with a lead form. Leads flow straight into your CRM." />
      <PagesView pages={JSON.parse(JSON.stringify(pages))} campaigns={campaigns} canWrite={can(ctx, "content:write")} />
    </>
  );
}
