import { route } from "@/server/api";
import { leadUpdateSchema } from "@/lib/schemas";
import { deleteLeads, getLead, updateLead } from "@/server/services/leads";

export const GET = route({ permission: "leads:read" }, async ({ ctx, params }) => getLead(ctx.workspace.id, params.id!));
export const PATCH = route({ permission: "leads:write", body: leadUpdateSchema }, async ({ ctx, params, body }) => updateLead(ctx, params.id!, body));
export const DELETE = route({ permission: "leads:delete" }, async ({ ctx, params }) => deleteLeads(ctx, [params.id!]));
