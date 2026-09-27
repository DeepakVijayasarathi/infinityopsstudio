import { route } from "@/server/api";
import { deleteFlag } from "@/server/services/admin";

export const DELETE = route({ auth: "admin" }, async ({ user, params }) => {
  await deleteFlag(user.id, params.key!);
  return { ok: true };
});
