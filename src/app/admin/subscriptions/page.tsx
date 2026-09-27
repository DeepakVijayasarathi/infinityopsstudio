import type { Metadata } from "next";
import { db } from "@/server/db";
import { adminSubscriptions } from "@/server/services/admin";
import { PageHeader } from "@/components/ui/page-header";
import { SubscriptionsView } from "./subscriptions-view";

export const metadata: Metadata = { title: "Subscriptions" };

export default async function AdminSubscriptionsPage() {
  const [subs, openInvoices] = await Promise.all([
    adminSubscriptions(),
    db.invoice.findMany({ where: { status: "OPEN" }, include: { workspace: { select: { name: true } } }, orderBy: { issuedAt: "desc" }, take: 50 }),
  ]);
  return (
    <>
      <PageHeader title="Subscriptions" description="Plans, billing providers and open invoices across the platform." />
      <SubscriptionsView subs={JSON.parse(JSON.stringify(subs))} openInvoices={JSON.parse(JSON.stringify(openInvoices))} />
    </>
  );
}
