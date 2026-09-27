import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacesTable } from "./workspaces-table";

export const metadata: Metadata = { title: "Workspaces" };

export default function AdminWorkspacesPage() {
  return (
    <>
      <PageHeader title="Workspaces" description="All tenants, their plans and usage. Plan overrides are audit-logged." />
      <WorkspacesTable />
    </>
  );
}
