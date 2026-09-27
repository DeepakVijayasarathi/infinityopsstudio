import { route } from "@/server/api";
import { disable2faSchema } from "@/lib/schemas";
import { disableTwoFactor } from "@/server/services/auth";

export const POST = route({ auth: "user", body: disable2faSchema, rateLimit: { limit: 10, windowSec: 900 } }, async ({ user, body }) => {
  await disableTwoFactor(user.id, body.password, body.code);
  return { ok: true };
});
