import type { Metadata } from "next";
import { requirePagePermission } from "@/server/page-context";
import { can } from "@/server/tenant";
import { db } from "@/server/db";
import { listAccounts, listPosts, socialAnalytics } from "@/server/services/social";
import { PageHeader } from "@/components/ui/page-header";
import { SocialView } from "./social-view";

export const metadata: Metadata = { title: "Social Media" };

export default async function SocialPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requirePagePermission("social:read");
  const ws = ctx.workspace.id;
  const [accounts, posts, analytics, campaigns] = await Promise.all([
    listAccounts(ws),
    listPosts(ws, { page: 1, pageSize: 100, order: "desc" }),
    socialAnalytics(ws, 30),
    db.campaign.findMany({ where: { workspaceId: ws, deletedAt: null, status: { not: "ARCHIVED" } }, select: { id: true, name: true } }),
  ]);
  const { tab } = await searchParams;
  return (
    <>
      <PageHeader title="Social Media" description="Plan, write, approve and schedule posts across every platform." />
      <SocialView
        initialTab={tab ?? "calendar"}
        accounts={JSON.parse(JSON.stringify(accounts))}
        posts={JSON.parse(JSON.stringify(posts.items))}
        analytics={JSON.parse(JSON.stringify(analytics))}
        campaigns={campaigns}
        perms={{ write: can(ctx, "social:write"), publish: can(ctx, "social:publish"), manage: can(ctx, "integrations:manage") }}
      />
    </>
  );
}
