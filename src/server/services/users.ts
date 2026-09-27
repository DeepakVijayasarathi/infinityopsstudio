import { db } from "../db";
import { badRequest } from "../errors";
import { audit } from "../audit";
import { verifyPassword } from "../auth/password";
import { revokeAllSessions } from "../auth/session";
import type { NotificationPrefs } from "./notifications";

export async function getProfile(userId: string) {
  return db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, name: true, email: true, avatarUrl: true, emailVerifiedAt: true, twoFactorEnabled: true, platformRole: true, createdAt: true, notificationPrefs: true, passwordHash: true, oauthAccounts: { select: { provider: true } } },
  }).then(({ passwordHash, ...u }) => ({ ...u, hasPassword: !!passwordHash, recoveryCodesRemaining: undefined }));
}

export async function updateProfile(userId: string, input: { name?: string; avatarUrl?: string | null }) {
  return db.user.update({ where: { id: userId }, data: input, select: { id: true, name: true, avatarUrl: true } });
}

export async function updateNotificationPrefs(userId: string, prefs: NotificationPrefs) {
  await db.user.update({ where: { id: userId }, data: { notificationPrefs: prefs } });
}

export async function listSessions(userId: string, currentSessionId: string) {
  const sessions = await db.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() }, twoFactorPending: false },
    orderBy: { lastUsedAt: "desc" },
    select: { id: true, ip: true, userAgent: true, createdAt: true, lastUsedAt: true, rememberMe: true },
  });
  return sessions.map((s) => ({ ...s, current: s.id === currentSessionId }));
}

export async function revokeUserSession(userId: string, sessionId: string) {
  const res = await db.session.updateMany({ where: { id: sessionId, userId }, data: { revokedAt: new Date() } });
  if (!res.count) throw badRequest("Session not found");
  await audit({ action: "auth.session_revoked", actorId: userId, entityType: "Session", entityId: sessionId });
}

export async function deleteAccount(userId: string, password: string | undefined) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { memberships: { include: { role: true } } } });
  if (user.passwordHash && !(password && (await verifyPassword(password, user.passwordHash)))) throw badRequest("Password is incorrect");
  for (const m of user.memberships.filter((m) => m.role.key === "owner")) {
    const owners = await db.workspaceMember.count({ where: { workspaceId: m.workspaceId, role: { key: "owner" } } });
    const members = await db.workspaceMember.count({ where: { workspaceId: m.workspaceId } });
    if (owners <= 1 && members > 1) throw badRequest("Transfer ownership of your shared workspaces before deleting your account");
    if (members === 1) await db.workspace.update({ where: { id: m.workspaceId }, data: { deletedAt: new Date() } });
  }
  await db.workspaceMember.deleteMany({ where: { userId } });
  await db.user.update({ where: { id: userId }, data: { deletedAt: new Date(), email: `deleted+${userId}@deleted.invalid`, passwordHash: null, twoFactorSecret: null, name: "Deleted user" } });
  await db.oAuthAccount.deleteMany({ where: { userId } });
  await revokeAllSessions(userId);
  await audit({ action: "user.deleted", actorId: userId });
}
