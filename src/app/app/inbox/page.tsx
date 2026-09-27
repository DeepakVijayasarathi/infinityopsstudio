import type { Metadata } from "next";
import { requirePagePermission } from "@/server/page-context";
import { can } from "@/server/tenant";
import { env } from "@/server/env";
import { db } from "@/server/db";
import { getOrCreateWidget } from "@/server/services/website";
import { PageHeader } from "@/components/ui/page-header";
import { InboxView } from "./inbox-view";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const ctx = await requirePagePermission("leads:read");
  const { c } = await searchParams;
  const canManage = can(ctx, "integrations:manage");
  const [widget, whatsapp] = await Promise.all([
    getOrCreateWidget(ctx.workspace.id),
    db.integration.findFirst({ where: { workspaceId: ctx.workspace.id, provider: "whatsapp", status: "CONNECTED" }, select: { id: true } }),
  ]);
  const base = env().APP_URL;
  return (
    <>
      <PageHeader title="Inbox" description="Website chat, WhatsApp and email in one place — with AI-drafted replies." />
      <InboxView
        initialId={c ?? null}
        canWrite={can(ctx, "leads:write")}
        channels={{
          whatsappConnected: !!whatsapp,
          // Webhook URLs contain credentials, so only integration managers see them.
          whatsappWebhook: canManage ? `${base}/api/public/whatsapp/${widget.publicKey}` : null,
          emailWebhook: canManage ? `${base}/api/public/email/${widget.inboundEmailToken}` : null,
          chatEnabled: widget.enabled && widget.chatEnabled,
        }}
      />
    </>
  );
}
