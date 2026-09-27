import { route } from "@/server/api";
import { twoFactorCodeSchema } from "@/lib/schemas";
import { regenerateRecoveryCodes } from "@/server/services/auth";

export const POST = route({ auth: "user", body: twoFactorCodeSchema, rateLimit: { limit: 5, windowSec: 900 } }, async ({ user, body }) => regenerateRecoveryCodes(user.id, body.code));
