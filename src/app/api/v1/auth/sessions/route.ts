import { route } from "@/server/api";
import { revokeAllSessions } from "@/server/auth/session";
import { listSessions } from "@/server/services/users";

export const GET = route({ auth: "user" }, async ({ user, session }) => listSessions(user.id, session.session.id));

// Sign out of all other devices.
export const DELETE = route({ auth: "user" }, async ({ user, session }) => {
  await revokeAllSessions(user.id, session.session.id);
  return { ok: true };
});
