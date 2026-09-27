import { route } from "@/server/api";
import { taskReviewSchema } from "@/lib/schemas";
import { reviewTask } from "@/server/services/workers";

export const POST = route({ permission: "tasks:approve", body: taskReviewSchema }, async ({ ctx, params, body }) => reviewTask(ctx, params.id!, body.decision, body.note, body.output));
