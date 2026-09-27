import { route } from "@/server/api";
import { tokenPasswordSchema } from "@/lib/schemas";
import { resetPassword } from "@/server/services/auth";

export const POST = route({ auth: "public", body: tokenPasswordSchema, rateLimit: { limit: 10, windowSec: 900 } }, async ({ body, meta }) => {
  await resetPassword(body.token, body.password, meta);
  return { ok: true };
});
