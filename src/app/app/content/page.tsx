import type { Metadata } from "next";
import { z } from "zod";
import { requirePagePermission } from "@/server/page-context";
import { can } from "@/server/tenant";
import { paginationSchema } from "@/server/pagination";
import { listContent } from "@/server/services/content";
import { CONTENT_STATUSES, CONTENT_TYPES } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { ContentLibrary } from "./content-library";

export const metadata: Metadata = { title: "Content Studio" };

const q = paginationSchema.extend({ type: z.enum(CONTENT_TYPES).optional().catch(undefined), status: z.enum(CONTENT_STATUSES).optional().catch(undefined) });

export default async function ContentPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requirePagePermission("content:read");
  const params = q.parse(await searchParams);
  const data = await listContent(ctx.workspace.id, params);
  return (
    <>
      <PageHeader title="Content Studio" description="Generate, edit, version and share on-brand marketing content." />
      <ContentLibrary data={JSON.parse(JSON.stringify(data))} canWrite={can(ctx, "content:write")} />
    </>
  );
}
