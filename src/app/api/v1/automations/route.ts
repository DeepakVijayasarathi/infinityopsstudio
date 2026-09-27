import { route } from "@/server/api";
import { workflowSchema } from "@/lib/schemas";
import { createWorkflow, listWorkflows } from "@/server/services/automations";

export const GET = route({ permission: "automations:read" }, async ({ ctx }) => listWorkflows(ctx.workspace.id));
export const POST = route({ permission: "automations:write", body: workflowSchema }, async ({ ctx, body }) => createWorkflow(ctx, body));
