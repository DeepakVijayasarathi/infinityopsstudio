import { route } from "@/server/api";
import { workspaceSchema } from "@/lib/schemas";
import { listMemberships } from "@/server/tenant";
import { createWorkspace } from "@/server/services/workspaces";

export const GET = route({ auth: "user" }, async ({ user }) => {
  const m = await listMemberships(user.id);
  return m.map((x) => ({ ...x.workspace, role: x.role.name }));
});

export const POST = route({ auth: "user", body: workspaceSchema, rateLimit: { limit: 10, windowSec: 3600 } }, async ({ user, body }) => {
  const ws = await createWorkspace(user.id, { name: body.name, industry: body.industry ?? undefined, website: body.website ?? undefined });
  return { id: ws.id, slug: ws.slug };
});
