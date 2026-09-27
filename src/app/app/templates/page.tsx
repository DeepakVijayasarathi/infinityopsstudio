import type { Metadata } from "next";
import { requireContext } from "@/server/page-context";
import { can } from "@/server/tenant";
import { listTemplates } from "@/server/services/templates";
import { PageHeader } from "@/components/ui/page-header";
import { TemplatesView } from "./templates-view";

export const metadata: Metadata = { title: "Templates" };

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requireContext();
  const { tab } = await searchParams;
  return (
    <>
      <PageHeader title="Templates" description="Proven starting points. Pick one and it's ready to edit in seconds — or let the AI build the whole campaign." />
      <TemplatesView
        data={listTemplates()}
        initialTab={tab === "emails" || tab === "automations" ? tab : "campaigns"}
        perms={{ campaigns: can(ctx, "campaigns:write"), emails: can(ctx, "email:write"), automations: can(ctx, "automations:write") }}
      />
    </>
  );
}
