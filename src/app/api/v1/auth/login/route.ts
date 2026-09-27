import { route } from "@/server/api";
import { loginSchema } from "@/lib/schemas";
import { login } from "@/server/services/auth";
import { enforceRateLimit } from "@/server/rate-limit";

export const POST = route({ auth: "public", body: loginSchema, rateLimit: { limit: 20, windowSec: 900, key: "login-ip" } }, async ({ body, meta }) => {
  // Per-account limit in addition to the per-IP limit, to slow credential stuffing.
  await enforceRateLimit(`login-account:${body.email}`, 10, 900);
  return login(body, meta);
});
