import { route } from "@/server/api";
import { audit } from "@/server/audit";
import { clearSessionCookie, revokeSession } from "@/server/auth/session";

export const POST = route({ auth: "public", allowTwoFactorPending: true }, async ({ session, meta }) => {
  if (session) {
    await revokeSession(session.session.id);
    await audit({ action: "auth.logout", actorId: session.user.id, ...meta });
  }
  await clearSessionCookie();
  return { ok: true };
});
