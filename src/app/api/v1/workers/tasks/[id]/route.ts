import { route } from "@/server/api";
import { getTask } from "@/server/services/workers";

export const GET = route({ permission: "workers:read" }, async ({ ctx, params }) => getTask(ctx.workspace.id, params.id!));
