import { route } from "@/server/api";
import { keywordSchema } from "@/lib/schemas";
import { deleteKeyword, updateKeyword } from "@/server/services/seo";

export const PATCH = route({ permission: "seo:write", body: keywordSchema.partial() }, async ({ ctx, params, body }) => updateKeyword(ctx, params.id!, body));
export const DELETE = route({ permission: "seo:write" }, async ({ ctx, params }) => {
  await deleteKeyword(ctx, params.id!);
  return { ok: true };
});
