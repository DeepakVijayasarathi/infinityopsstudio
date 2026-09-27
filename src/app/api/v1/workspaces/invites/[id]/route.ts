import { route } from "@/server/api";
import { revokeInvite } from "@/server/services/workspaces";

export const DELETE = route({ permission: "members:manage" }, async ({ ctx, params }) => {
  await revokeInvite(ctx, params.id!);
  return { ok: true };
});
