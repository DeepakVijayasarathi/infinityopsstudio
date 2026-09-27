import { route } from "@/server/api";
import { rotateSession } from "@/server/auth/session";

// Explicit refresh-token rotation endpoint used by the client keep-alive.
export const POST = route({ auth: "user", rateLimit: { limit: 60, windowSec: 3600 } }, async ({ session }) => {
  await rotateSession(session);
  return { ok: true };
});
