import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { AuditTable } from "./audit-table";

export const metadata: Metadata = { title: "Audit logs" };

export default function AdminAuditPage() {
  return (
    <>
      <PageHeader title="Audit logs" description="Append-only record of security-relevant and administrative actions." />
      <AuditTable />
    </>
  );
}
