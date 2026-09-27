import { route } from "@/server/api";
import { workflowUpdateSchema } from "@/lib/schemas";
import { deleteWorkflow, getWorkflow, updateWorkflow } from "@/server/services/automations";

export const GET = route({ permission: "automations:read" }, async ({ ctx, params }) => getWorkflow(ctx.workspace.id, params.id!));
export const PATCH = route({ permission: "automations:write", body: workflowUpdateSchema }, async ({ ctx, params, body }) => updateWorkflow(ctx, params.id!, body));
export const DELETE = route({ permission: "automations:write" }, async ({ ctx, params }) => {
  await deleteWorkflow(ctx, params.id!);
  return { ok: true };
});
