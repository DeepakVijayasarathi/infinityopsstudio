import { z } from "zod";
import { route } from "@/server/api";
import { profileSchema } from "@/lib/schemas";
import { clearSessionCookie } from "@/server/auth/session";
import { deleteAccount, getProfile, updateProfile } from "@/server/services/users";

export const GET = route({ auth: "user" }, async ({ user }) => getProfile(user.id));
export const PATCH = route({ auth: "user", body: profileSchema }, async ({ user, body }) => updateProfile(user.id, body));
export const DELETE = route({ auth: "user", body: z.object({ password: z.string().max(128).optional() }) }, async ({ user, body }) => {
  await deleteAccount(user.id, body.password);
  await clearSessionCookie();
  return { ok: true };
});
