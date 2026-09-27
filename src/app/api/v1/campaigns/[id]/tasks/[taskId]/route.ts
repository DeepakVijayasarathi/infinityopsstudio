import { route } from "@/server/api";
import { campaignTaskUpdateSchema } from "@/lib/schemas";
import { deleteTask, updateTask } from "@/server/services/campaigns";

export const PATCH = route({ permission: "campaigns:write", body: campaignTaskUpdateSchema }, async ({ ctx, params, body }) => updateTask(ctx, params.id!, params.taskId!, body));
export const DELETE = route({ permission: "campaigns:write" }, async ({ ctx, params }) => {
  await deleteTask(ctx, params.id!, params.taskId!);
  return { ok: true };
});
