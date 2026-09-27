import { route } from "@/server/api";
import { signupSchema } from "@/lib/schemas";
import { signup } from "@/server/services/auth";
import { acceptInvite } from "@/server/services/workspaces";

export const POST = route({ auth: "public", body: signupSchema, rateLimit: { limit: 5, windowSec: 3600, key: "signup" } }, async ({ body, meta }) => {
  const user = await signup(body, meta);
  if (body.inviteToken) await acceptInvite(user, body.inviteToken);
  return { id: user.id, email: user.email };
});
