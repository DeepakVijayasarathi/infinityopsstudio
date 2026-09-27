import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { LogsTable } from "./logs-table";

export const metadata: Metadata = { title: "System logs" };

export default function AdminLogsPage() {
  return (
    <>
      <PageHeader title="System logs" description="Unhandled API errors, background job failures and operational events." />
      <LogsTable />
    </>
  );
}
