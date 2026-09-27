import { z } from "zod";
import { route } from "@/server/api";
import { deleteLeadTask, toggleLeadTask } from "@/server/services/leads";

export const PATCH = route({ permission: "leads:write", body: z.object({ done: z.boolean() }) }, async ({ ctx, params, body }) => toggleLeadTask(ctx, params.id!, params.taskId!, body.done));
export const DELETE = route({ permission: "leads:write" }, async ({ ctx, params }) => {
  await deleteLeadTask(ctx, params.id!, params.taskId!);
  return { ok: true };
});
