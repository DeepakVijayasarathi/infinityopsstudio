import type { Metadata } from "next";
import { listFlags } from "@/server/services/admin";
import { PageHeader } from "@/components/ui/page-header";
import { FlagsView } from "./flags-view";

export const metadata: Metadata = { title: "Feature flags" };

export default async function AdminFlagsPage() {
  const flags = await listFlags();
  return (
    <>
      <PageHeader title="Feature flags" description="Gradually roll out features by percentage or to specific workspaces." />
      <FlagsView flags={JSON.parse(JSON.stringify(flags))} />
    </>
  );
}
