import { route } from "@/server/api";
import { tokenPasswordSchema } from "@/lib/schemas";
import { completeAccountRecovery } from "@/server/services/auth";

export const POST = route({ auth: "public", body: tokenPasswordSchema, rateLimit: { limit: 5, windowSec: 900 } }, async ({ body, meta }) => {
  await completeAccountRecovery(body.token, body.password, meta);
  return { ok: true };
});
