import type { Metadata } from "next";
import { requireContext } from "@/server/page-context";
import { can } from "@/server/tenant";
import { brandCompleteness, getBrandKit } from "@/server/services/brand";
import { PageHeader } from "@/components/ui/page-header";
import { BrandForm } from "./brand-form";

export const metadata: Metadata = { title: "Brand Kit" };

export default async function BrandPage() {
  const ctx = await requireContext();
  const kit = await getBrandKit(ctx.workspace.id);
  return (
    <>
      <PageHeader title="Brand Kit" description="Everything your AI workers need to sound like you. Used on every AI request." />
      <BrandForm kit={JSON.parse(JSON.stringify(kit))} completeness={brandCompleteness(kit)} canEdit={can(ctx, "brand:manage")} />
    </>
  );
}
