import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePagePermission } from "@/server/page-context";
import { can } from "@/server/tenant";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";
import { getPage } from "@/server/services/landing-pages";
import { PageEditor } from "./page-editor";

export const metadata: Metadata = { title: "Edit landing page" };

export default async function EditLandingPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePagePermission("content:read");
  const { id } = await params;
  const page = await getPage(ctx.workspace.id, id).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  return <PageEditor page={JSON.parse(JSON.stringify(page))} appUrl={env().APP_URL} canWrite={can(ctx, "content:write")} canPublish={can(ctx, "content:approve")} />;
}
