import { route } from "@/server/api";
import { seoProjectSchema } from "@/lib/schemas";
import { deleteProject, getProject, updateProject } from "@/server/services/seo";

export const GET = route({ permission: "seo:read" }, async ({ ctx, params }) => getProject(ctx.workspace.id, params.id!));
export const PATCH = route({ permission: "seo:write", body: seoProjectSchema.omit({ domain: true }).partial() }, async ({ ctx, params, body }) => updateProject(ctx, params.id!, body));
export const DELETE = route({ permission: "seo:write" }, async ({ ctx, params }) => {
  await deleteProject(ctx, params.id!);
  return { ok: true };
});
