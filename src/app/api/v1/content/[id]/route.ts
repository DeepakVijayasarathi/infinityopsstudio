import { route } from "@/server/api";
import { contentUpdateSchema } from "@/lib/schemas";
import { deleteContent, getContent, updateContent } from "@/server/services/content";

export const GET = route({ permission: "content:read" }, async ({ ctx, params }) => getContent(ctx.workspace.id, params.id!));
export const PATCH = route({ permission: "content:write", body: contentUpdateSchema }, async ({ ctx, params, body }) => updateContent(ctx, params.id!, body));
export const DELETE = route({ permission: "content:write" }, async ({ ctx, params }) => {
  await deleteContent(ctx, params.id!);
  return { ok: true };
});
