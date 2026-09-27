import type { Metadata } from "next";
import { requirePagePermission } from "@/server/page-context";
import { db } from "@/server/db";
import { GENERATORS } from "@/server/ai/prompts";
import { TONES } from "@/server/ai/prompts";
import { PageHeader } from "@/components/ui/page-header";
import { Generator } from "./generator";

export const metadata: Metadata = { title: "Generate content" };

export default async function NewContentPage({ searchParams }: { searchParams: Promise<{ campaignId?: string; generator?: string }> }) {
  const ctx = await requirePagePermission("content:write");
  const sp = await searchParams;
  const campaigns = await db.campaign.findMany({ where: { workspaceId: ctx.workspace.id, deletedAt: null, status: { not: "ARCHIVED" } }, select: { id: true, name: true }, orderBy: { updatedAt: "desc" } });
  const generators = Object.entries(GENERATORS).map(([key, g]) => ({ key, label: g.label, description: g.description, fields: g.fields }));
  return (
    <>
      <PageHeader title="Generate content" description="Choose a format, describe what you need and let AI draft it in your brand voice." />
      <Generator generators={generators} tones={[...TONES]} campaigns={campaigns} initialCampaignId={sp.campaignId ?? ""} initialGenerator={sp.generator ?? "blog"} />
    </>
  );
}
