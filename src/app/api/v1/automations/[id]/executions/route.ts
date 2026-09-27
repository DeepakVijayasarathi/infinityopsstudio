import { route } from "@/server/api";
import { listExecutions } from "@/server/services/automations";

export const GET = route({ permission: "automations:read" }, async ({ ctx, params }) => listExecutions(ctx.workspace.id, params.id!));
