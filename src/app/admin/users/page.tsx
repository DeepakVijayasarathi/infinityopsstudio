import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { UsersTable } from "./users-table";

export const metadata: Metadata = { title: "Users" };

export default function AdminUsersPage() {
  return (
    <>
      <PageHeader title="Users" description="Search accounts, suspend abuse and manage platform administrators." />
      <UsersTable />
    </>
  );
}
