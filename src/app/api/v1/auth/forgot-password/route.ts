import { route } from "@/server/api";
import { emailOnlySchema } from "@/lib/schemas";
import { requestPasswordReset } from "@/server/services/auth";

export const POST = route({ auth: "public", body: emailOnlySchema, rateLimit: { limit: 5, windowSec: 900, key: "forgot" } }, async ({ body, meta }) => {
  await requestPasswordReset(body.email, meta);
  return { ok: true };
});
