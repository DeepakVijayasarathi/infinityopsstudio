import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getSession } from "./auth/session";
import { getWorkspaceContext, can, type WorkspaceContext } from "./tenant";
import type { Permission } from "@/config/permissions";

/** For server components under /app: guarantees a session + workspace, else redirects. */
export const requireContext = cache(async (): Promise<WorkspaceContext> => {
  const session = await getSession();
  if (!session) redirect("/login");
  const ctx = await getWorkspaceContext(session.user);
  if (!ctx) redirect("/onboarding");
  return ctx;
});

/** Page-level RBAC guard. */
export async function requirePagePermission(permission: Permission): Promise<WorkspaceContext> {
  const ctx = await requireContext();
  if (!can(ctx, permission)) redirect(`/app/forbidden?need=${encodeURIComponent(permission)}`);
  return ctx;
}
