import { route } from "@/server/api";
import { twoFactorCodeSchema } from "@/lib/schemas";
import { enableTwoFactor } from "@/server/services/auth";

export const POST = route({ auth: "user", body: twoFactorCodeSchema, rateLimit: { limit: 10, windowSec: 900 } }, async ({ user, body }) => enableTwoFactor(user.id, body.code));
