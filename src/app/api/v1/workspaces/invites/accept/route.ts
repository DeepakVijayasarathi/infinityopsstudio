import { cookies } from "next/headers";
import { route } from "@/server/api";
import { tokenSchema } from "@/lib/schemas";
import { acceptInvite } from "@/server/services/workspaces";
import { WORKSPACE_COOKIE, cookieBase } from "@/server/auth/cookies";

export const POST = route({ auth: "user", body: tokenSchema }, async ({ user, body }) => {
  const workspaceId = await acceptInvite(user, body.token);
  (await cookies()).set(WORKSPACE_COOKIE, workspaceId, { ...cookieBase(), maxAge: 60 * 60 * 24 * 365 });
  return { workspaceId };
});
