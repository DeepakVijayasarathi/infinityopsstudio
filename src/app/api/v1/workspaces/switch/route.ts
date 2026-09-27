import { z } from "zod";
import { cookies } from "next/headers";
import { route } from "@/server/api";
import { forbidden } from "@/server/errors";
import { db } from "@/server/db";
import { resolveWorkspace } from "@/server/tenant";
import { WORKSPACE_COOKIE, cookieBase } from "@/server/auth/cookies";

export const POST = route({ auth: "user", body: z.object({ workspaceId: z.string().min(1) }) }, async ({ user, body }) => {
  const ctx = await resolveWorkspace(user, body.workspaceId);
  if (!ctx) throw forbidden("You are not a member of that workspace");
  const jar = await cookies();
  jar.set(WORKSPACE_COOKIE, ctx.workspace.id, { ...cookieBase(), maxAge: 60 * 60 * 24 * 365 });
  await db.user.update({ where: { id: user.id }, data: { lastWorkspaceId: ctx.workspace.id } });
  return { workspace: ctx.workspace };
});
