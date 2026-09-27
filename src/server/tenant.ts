import { cookies } from "next/headers";
import { cache } from "react";
import type { PlanKey, Workspace } from "@prisma/client";
import { db } from "./db";
import { forbidden, notFound } from "./errors";
import { WORKSPACE_COOKIE } from "./auth/cookies";
import type { SessionUser } from "./auth/session";
import { hasPermission, type Permission } from "@/config/permissions";

export type WorkspaceContext = {
  user: SessionUser;
  workspace: Pick<Workspace, "id" | "name" | "slug" | "logoUrl" | "timezone">;
  role: { id: string; key: string; name: string; rank: number; permissions: string[] };
  plan: PlanKey;
};

export async function listMemberships(userId: string) {
  return db.workspaceMember.findMany({
    where: { userId, workspace: { deletedAt: null } },
    include: { workspace: { select: { id: true, name: true, slug: true, logoUrl: true } }, role: { select: { key: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Resolves the active workspace for a user. Membership is always verified —
 * this is the tenant isolation boundary for every request.
 */
export async function resolveWorkspace(user: SessionUser, requestedId?: string | null): Promise<WorkspaceContext | null> {
  let candidate = requestedId ?? null;
  if (!candidate) {
    const jar = await cookies();
    candidate = jar.get(WORKSPACE_COOKIE)?.value ?? user.lastWorkspaceId ?? null;
  }

  const include = {
    workspace: { select: { id: true, name: true, slug: true, logoUrl: true, timezone: true, deletedAt: true, subscription: { select: { plan: true } } } },
    role: { select: { id: true, key: true, name: true, rank: true, permissions: true } },
  } as const;

  let member = candidate
    ? await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: candidate, userId: user.id } }, include })
    : null;

  if (member?.workspace.deletedAt) member = null;
  if (!member) {
    if (requestedId) return null; // explicit request for a workspace the user cannot access
    member = await db.workspaceMember.findFirst({
      where: { userId: user.id, workspace: { deletedAt: null } },
      include,
      orderBy: { createdAt: "asc" },
    });
  }
  if (!member) return null;

  const { deletedAt: _d, subscription, ...workspace } = member.workspace;
  return { user, workspace, role: member.role, plan: subscription?.plan ?? "FREE" };
}

export const getWorkspaceContext = cache(async (user: SessionUser) => resolveWorkspace(user));

export function can(ctx: WorkspaceContext, permission: Permission): boolean {
  return hasPermission(ctx.role.permissions, permission);
}

export function assertCan(ctx: WorkspaceContext, permission: Permission): void {
  if (!can(ctx, permission)) throw forbidden(`Your role (${ctx.role.name}) cannot perform this action`);
}

/** Loads a tenant-owned record and guarantees it belongs to the workspace. */
export function ensureFound<T>(record: T | null | undefined, entity: string): T {
  if (!record) throw notFound(entity);
  return record;
}
