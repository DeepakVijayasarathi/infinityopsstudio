import { route } from "@/server/api";
import { emailOnlySchema } from "@/lib/schemas";
import { requestAccountRecovery } from "@/server/services/auth";

export const POST = route({ auth: "public", body: emailOnlySchema, rateLimit: { limit: 3, windowSec: 3600, key: "recovery" } }, async ({ body, meta }) => {
  await requestAccountRecovery(body.email, meta);
  return { ok: true };
});
