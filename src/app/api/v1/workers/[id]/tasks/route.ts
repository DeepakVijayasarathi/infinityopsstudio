import { route } from "@/server/api";
import { paginationSchema } from "@/server/pagination";
import { taskCreateSchema } from "@/lib/schemas";
import { createTask, listTasks } from "@/server/services/workers";

export const GET = route({ permission: "workers:read", query: paginationSchema }, async ({ ctx, params, query }) => listTasks(ctx.workspace.id, { ...query, workerId: params.id }));
export const POST = route({ permission: "workers:run", body: taskCreateSchema, rateLimit: { limit: 60, windowSec: 3600 } }, async ({ ctx, params, body }) => createTask(ctx, params.id!, body));
