import { route } from "@/server/api";
import { unauthenticated } from "@/server/errors";
import { twoFactorCodeSchema } from "@/lib/schemas";
import { completeTwoFactor } from "@/server/services/auth";

export const POST = route({ auth: "public", allowTwoFactorPending: true, body: twoFactorCodeSchema, rateLimit: { limit: 10, windowSec: 900, key: "2fa" } }, async ({ session, body, meta }) => {
  if (!session?.session.twoFactorPending) throw unauthenticated("Sign in again to continue");
  return completeTwoFactor(session, body.code, meta);
});
