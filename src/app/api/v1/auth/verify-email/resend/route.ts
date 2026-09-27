import { route } from "@/server/api";
import { badRequest } from "@/server/errors";
import { sendVerificationEmail } from "@/server/services/auth";

export const POST = route({ auth: "user", rateLimit: { limit: 3, windowSec: 3600 } }, async ({ user }) => {
  if (user.emailVerifiedAt) throw badRequest("Your email is already verified");
  await sendVerificationEmail(user);
  return { ok: true };
});
