import { route } from "@/server/api";
import { listRoles } from "@/server/services/workspaces";

export const GET = route({}, async ({ ctx }) => listRoles(ctx.workspace.id));
