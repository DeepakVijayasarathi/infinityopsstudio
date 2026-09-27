import { z } from "zod";
import { route } from "@/server/api";
import { exportContent, getContent } from "@/server/services/content";

export const GET = route({ permission: "content:read", query: z.object({ format: z.enum(["md", "html", "txt"]).default("md") }) }, async ({ ctx, params, query }) => {
  const content = await getContent(ctx.workspace.id, params.id!);
  const file = exportContent(content, query.format);
  return new Response(file.body, { headers: { "content-type": file.mime, "content-disposition": `attachment; filename="${file.filename}"` } });
});
