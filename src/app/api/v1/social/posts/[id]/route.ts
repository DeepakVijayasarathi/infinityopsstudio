import { route } from "@/server/api";
import { socialPostUpdateSchema } from "@/lib/schemas";
import { deletePost, getPost, updatePost } from "@/server/services/social";

export const GET = route({ permission: "social:read" }, async ({ ctx, params }) => getPost(ctx.workspace.id, params.id!));
export const PATCH = route({ permission: "social:write", body: socialPostUpdateSchema }, async ({ ctx, params, body }) => updatePost(ctx, params.id!, body));
export const DELETE = route({ permission: "social:write" }, async ({ ctx, params }) => {
  await deletePost(ctx, params.id!);
  return { ok: true };
});
