import type { Metadata } from "next";
import { requireContext } from "@/server/page-context";
import { can } from "@/server/tenant";
import { env } from "@/server/env";
import { listFiles } from "@/server/services/files";
import { FilesView } from "./files-view";

export const metadata: Metadata = { title: "Files" };

export default async function FilesPage() {
  const ctx = await requireContext();
  const files = await listFiles(ctx.workspace.id);
  return <FilesView files={JSON.parse(JSON.stringify(files))} canUpload={can(ctx, "content:write")} maxMb={Math.round(env().MAX_UPLOAD_BYTES / 1024 / 1024)} />;
}
