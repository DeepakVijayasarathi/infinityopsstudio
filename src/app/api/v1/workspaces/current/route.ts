import { z } from "zod";
import { route } from "@/server/api";
import { workspaceSchema } from "@/lib/schemas";
import { db } from "@/server/db";
import { deleteWorkspace, updateWorkspace } from "@/server/services/workspaces";

export const GET = route({}, async ({ ctx }) => {
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: ctx.workspace.id } });
  return { ...ws, role: ctx.role, plan: ctx.plan };
});
export const PATCH = route({ permission: "workspace:manage", body: workspaceSchema.partial() }, async ({ ctx, body }) => updateWorkspace(ctx, body));
export const DELETE = route({ permission: "workspace:delete", body: z.object({ confirmName: z.string() }) }, async ({ ctx, body }) => {
  await deleteWorkspace(ctx, body.confirmName);
  return { ok: true };
});
