import { route } from "@/server/api";
import { emailTemplateSchema } from "@/lib/schemas";
import { deleteTemplate, upsertTemplate } from "@/server/services/email";

export const PATCH = route({ permission: "email:write", body: emailTemplateSchema }, async ({ ctx, params, body }) => upsertTemplate(ctx, params.id!, body));
export const DELETE = route({ permission: "email:write" }, async ({ ctx, params }) => {
  await deleteTemplate(ctx, params.id!);
  return { ok: true };
});
