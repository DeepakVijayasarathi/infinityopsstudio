import { route } from "@/server/api";
import { listMemberships, resolveWorkspace } from "@/server/tenant";

export const GET = route({ auth: "user" }, async ({ user, req }) => {
  const ctx = await resolveWorkspace(user, req.headers.get("x-workspace-id"));
  const memberships = await listMemberships(user.id);
  return {
    user,
    workspace: ctx?.workspace ?? null,
    role: ctx?.role ? { key: ctx.role.key, name: ctx.role.name, permissions: ctx.role.permissions } : null,
    plan: ctx?.plan ?? null,
    workspaces: memberships.map((m) => ({ ...m.workspace, role: m.role.name })),
  };
});
