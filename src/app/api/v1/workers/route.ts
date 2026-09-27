import { route } from "@/server/api";
import { listWorkers } from "@/server/services/workers";

export const GET = route({ permission: "workers:read" }, async ({ ctx }) => listWorkers(ctx.workspace.id));
