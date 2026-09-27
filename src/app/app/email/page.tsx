import type { Metadata } from "next";
import { requirePagePermission } from "@/server/page-context";
import { can } from "@/server/tenant";
import { emailStats, listEmailCampaigns, listTemplates, unsubscribedLeads } from "@/server/services/email";
import { PageHeader } from "@/components/ui/page-header";
import { EmailView } from "./email-view";

export const metadata: Metadata = { title: "Email Marketing" };

export default async function EmailPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requirePagePermission("email:read");
  const ws = ctx.workspace.id;
  const [campaigns, templates, stats, unsubscribed] = await Promise.all([listEmailCampaigns(ws), listTemplates(ws), emailStats(ws), unsubscribedLeads(ws)]);
  const { tab } = await searchParams;
  return (
    <>
      <PageHeader title="Email Marketing" description="Broadcasts and automated sequences with segmentation, personalization and tracking." />
      <EmailView
        initialTab={tab ?? "campaigns"}
        campaigns={JSON.parse(JSON.stringify(campaigns))}
        templates={JSON.parse(JSON.stringify(templates))}
        stats={stats}
        unsubscribed={JSON.parse(JSON.stringify(unsubscribed))}
        perms={{ write: can(ctx, "email:write"), send: can(ctx, "email:send") }}
      />
    </>
  );
}
