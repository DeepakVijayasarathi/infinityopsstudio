import { route } from "@/server/api";
import { emailCampaignSchema } from "@/lib/schemas";
import { deleteEmailCampaign, getEmailCampaign, updateEmailCampaign } from "@/server/services/email";

export const GET = route({ permission: "email:read" }, async ({ ctx, params }) => getEmailCampaign(ctx.workspace.id, params.id!));
export const PATCH = route({ permission: "email:write", body: emailCampaignSchema.partial() }, async ({ ctx, params, body }) => updateEmailCampaign(ctx, params.id!, body));
export const DELETE = route({ permission: "email:write" }, async ({ ctx, params }) => {
  await deleteEmailCampaign(ctx, params.id!);
  return { ok: true };
});
