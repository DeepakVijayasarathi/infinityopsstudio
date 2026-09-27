import { route } from "@/server/api";
import { emailTemplateSchema } from "@/lib/schemas";
import { listTemplates, upsertTemplate } from "@/server/services/email";

export const GET = route({ permission: "email:read" }, async ({ ctx }) => listTemplates(ctx.workspace.id));
export const POST = route({ permission: "email:write", body: emailTemplateSchema }, async ({ ctx, body }) => upsertTemplate(ctx, null, body));
