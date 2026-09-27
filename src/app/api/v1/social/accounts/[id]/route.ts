import { route } from "@/server/api";
import { disconnectAccount } from "@/server/services/social";

export const DELETE = route({ permission: "integrations:manage" }, async ({ ctx, params }) => {
  await disconnectAccount(ctx, params.id!);
  return { ok: true };
});
