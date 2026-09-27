import { z } from "zod";
import { route } from "@/server/api";
import { getConversation, updateConversation } from "@/server/services/inbox";

export const GET = route({ permission: "leads:read" }, async ({ ctx, params }) => getConversation(ctx.workspace.id, params.id!));

const schema = z.object({ status: z.enum(["OPEN", "CLOSED"]).optional(), aiEnabled: z.boolean().optional() });

export const PATCH = route({ permission: "leads:write", body: schema }, async ({ ctx, params, body }) => updateConversation(ctx, params.id!, body));
