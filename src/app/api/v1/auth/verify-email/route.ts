import { route } from "@/server/api";
import { tokenSchema } from "@/lib/schemas";
import { verifyEmail } from "@/server/services/auth";

export const POST = route({ auth: "public", body: tokenSchema, rateLimit: { limit: 20, windowSec: 900 } }, async ({ body }) => {
  await verifyEmail(body.token);
  return { ok: true };
});
