import { route } from "@/server/api";
import { revokeUserSession } from "@/server/services/users";

export const DELETE = route({ auth: "user" }, async ({ user, params }) => {
  await revokeUserSession(user.id, params.id!);
  return { ok: true };
});
