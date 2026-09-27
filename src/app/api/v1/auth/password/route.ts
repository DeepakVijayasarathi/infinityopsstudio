import { route } from "@/server/api";
import { changePasswordSchema } from "@/lib/schemas";
import { changePassword } from "@/server/services/auth";

export const PATCH = route({ auth: "user", body: changePasswordSchema, rateLimit: { limit: 5, windowSec: 900 } }, async ({ user, session, body }) => {
  await changePassword(user.id, session.session.id, body.currentPassword, body.newPassword);
  return { ok: true };
});
