import { route } from "@/server/api";
import { unsubscribedLeads } from "@/server/services/email";

export const GET = route({ permission: "email:read" }, async ({ ctx }) => unsubscribedLeads(ctx.workspace.id));
