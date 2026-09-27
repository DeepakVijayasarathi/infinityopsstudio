import { cookies, headers } from "next/headers";
import { cache } from "react";
import type { Session, User } from "@prisma/client";
import { db } from "../db";
import { randomToken, sha256 } from "../crypto";
import { logger } from "../logger";
import { SESSION_COOKIE, cookieBase } from "./cookies";

const DAY = 24 * 60 * 60 * 1000;
export const SESSION_TTL_MS = DAY; // standard session, sliding
export const REMEMBER_TTL_MS = 30 * DAY;
export const ROTATE_AFTER_MS = 15 * 60 * 1000;
/** Window in which the previous token is still honoured (parallel requests during rotation). */
export const ROTATION_GRACE_MS = 60 * 1000;

export type SessionUser = Pick<
  User,
  "id" | "email" | "name" | "avatarUrl" | "platformRole" | "emailVerifiedAt" | "twoFactorEnabled" | "lastWorkspaceId" | "status"
>;
export type ValidSession = { session: Session; user: SessionUser; token: string };

const userSelect = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  platformRole: true,
  emailVerifiedAt: true,
  twoFactorEnabled: true,
  lastWorkspaceId: true,
  status: true,
  deletedAt: true,
} as const;

export async function requestMeta() {
  const h = await headers();
  return {
    ip: (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim(),
    userAgent: h.get("user-agent")?.slice(0, 255) ?? null,
  };
}

export async function createSession(userId: string, opts: { rememberMe?: boolean; twoFactorPending?: boolean } = {}) {
  const token = randomToken();
  const meta = await requestMeta();
  const ttl = opts.rememberMe ? REMEMBER_TTL_MS : SESSION_TTL_MS;
  const session = await db.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      rememberMe: !!opts.rememberMe,
      twoFactorPending: !!opts.twoFactorPending,
      expiresAt: new Date(Date.now() + ttl),
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
  });
  await setSessionCookie(token, session.rememberMe ? session.expiresAt : undefined);
  return { session, token };
}

export async function setSessionCookie(token: string, expires?: Date) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { ...cookieBase(), ...(expires ? { expires } : {}) });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/**
 * Validates a raw session token. Detects refresh-token reuse: if an already-rotated
 * token is presented after the grace window, the whole session is revoked.
 */
export async function validateSessionToken(token: string): Promise<ValidSession | null> {
  const hash = sha256(token);
  let session = await db.session.findUnique({ where: { tokenHash: hash }, include: { user: { select: userSelect } } });

  if (!session) {
    const previous = await db.session.findUnique({ where: { previousTokenHash: hash }, include: { user: { select: userSelect } } });
    if (!previous) return null;
    if (Date.now() - previous.rotatedAt.getTime() > ROTATION_GRACE_MS) {
      await db.session.update({ where: { id: previous.id }, data: { revokedAt: new Date() } });
      await db.auditLog.create({
        data: { actorId: previous.userId, action: "auth.session.reuse_detected", entityType: "Session", entityId: previous.id },
      });
      logger.warn("Session token reuse detected; session revoked", { sessionId: previous.id });
      return null;
    }
    session = previous;
  }

  if (session.revokedAt || session.expiresAt.getTime() < Date.now()) return null;
  if (session.user.deletedAt || session.user.status !== "ACTIVE") return null;

  const { deletedAt: _d, ...user } = session.user;
  return { session, user, token };
}

/** Rotate the token (refresh-token rotation) and slide expiry. Must run where cookies are writable. */
export async function rotateSession(current: ValidSession): Promise<string> {
  const { session } = current;
  const currentHash = sha256(current.token);
  if (currentHash !== session.tokenHash) return current.token; // already rotated by a concurrent request
  const token = randomToken();
  const ttl = session.rememberMe ? REMEMBER_TTL_MS : SESSION_TTL_MS;
  const expiresAt = new Date(Date.now() + ttl);
  await db.session.update({
    where: { id: session.id },
    data: { tokenHash: sha256(token), previousTokenHash: currentHash, rotatedAt: new Date(), lastUsedAt: new Date(), expiresAt },
  });
  await setSessionCookie(token, session.rememberMe ? expiresAt : undefined);
  return token;
}

export function needsRotation(session: Session): boolean {
  return Date.now() - session.rotatedAt.getTime() > ROTATE_AFTER_MS;
}

/** Read-only session lookup for server components (memoized per request). */
export const getSession = cache(async (): Promise<ValidSession | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const result = await validateSessionToken(token);
  if (!result || result.session.twoFactorPending) return null;
  return result;
});

/** Session awaiting second factor. */
export async function getPendingTwoFactorSession(): Promise<ValidSession | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const result = await validateSessionToken(token);
  return result?.session.twoFactorPending ? result : null;
}

export async function revokeSession(sessionId: string) {
  await db.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } }).catch(() => undefined);
}

export async function revokeAllSessions(userId: string, exceptSessionId?: string) {
  await db.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });
}
