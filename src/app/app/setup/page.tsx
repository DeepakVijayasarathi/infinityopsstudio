import type { Metadata } from "next";
import { requireContext } from "@/server/page-context";
import { can } from "@/server/tenant";
import { getBrandKit } from "@/server/services/brand";
import { AUTOMATION_TEMPLATES, CAMPAIGN_TEMPLATES } from "@/config/templates";
import { SetupWizard } from "./setup-wizard";

export const metadata: Metadata = { title: "Guided setup" };

export default async function SetupPage() {
  const ctx = await requireContext();
  const kit = await getBrandKit(ctx.workspace.id);
  return (
    <SetupWizard
      kit={{ companyName: kit?.companyName ?? ctx.workspace.name, website: kit?.website ?? null, industry: kit?.industry ?? null, tagline: kit?.tagline ?? null, targetAudience: kit?.targetAudience ?? null, voice: kit?.voice ?? null }}
      campaigns={CAMPAIGN_TEMPLATES.map((t) => ({ key: t.key, name: t.name, description: t.description, goal: t.goal }))}
      automations={AUTOMATION_TEMPLATES.map((t) => ({ key: t.key, name: t.name, description: t.description }))}
      perms={{ brand: can(ctx, "brand:manage"), campaigns: can(ctx, "campaigns:write"), automations: can(ctx, "automations:write"), members: can(ctx, "members:manage"), integrations: can(ctx, "integrations:manage") }}
    />
  );
}
