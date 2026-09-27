import { route } from "@/server/api";
import { roleChangeSchema } from "@/lib/schemas";
import { assertCan } from "@/server/tenant";
import { db } from "@/server/db";
import { changeMemberRole, removeMember } from "@/server/services/workspaces";

export const PATCH = route({ permission: "members:manage", body: roleChangeSchema }, async ({ ctx, params, body }) => changeMemberRole(ctx, params.id!, body.roleId));

export const DELETE = route({}, async ({ ctx, params }) => {
  // Anyone may leave; removing others requires members:manage.
  const member = await db.workspaceMember.findFirst({ where: { id: params.id, workspaceId: ctx.workspace.id } });
  if (member?.userId !== ctx.user.id) assertCan(ctx, "members:manage");
  await removeMember(ctx, params.id!);
  return { ok: true };
});
