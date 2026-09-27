import { route } from "@/server/api";
import { workerUpdateSchema } from "@/lib/schemas";
import { getWorker, updateWorker } from "@/server/services/workers";

export const GET = route({ permission: "workers:read" }, async ({ ctx, params }) => getWorker(ctx.workspace.id, params.id!));
export const PATCH = route({ permission: "workers:manage", body: workerUpdateSchema }, async ({ ctx, params, body }) => updateWorker(ctx, params.id!, body));
