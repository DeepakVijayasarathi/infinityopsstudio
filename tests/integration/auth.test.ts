import { beforeEach, describe, expect, it } from "vitest";
import { TOTP, Secret } from "otpauth";
import { db } from "@/server/db";
import { beginTwoFactorSetup, completeTwoFactor, enableTwoFactor, login, signup } from "@/server/services/auth";
import { getPendingTwoFactorSession, getSession, rotateSession, validateSessionToken, ROTATION_GRACE_MS } from "@/server/auth/session";
import { SESSION_COOKIE } from "@/server/auth/cookies";
import { cookieJar, clearCookies } from "../helpers/next-headers";
import { resetDb } from "../helpers/factory";

const meta = { ip: "127.0.0.1", userAgent: "vitest" };
const creds = { name: "Maya Ortiz", email: "Maya@Example.com", password: "Launch2026!" };

beforeEach(resetDb);

describe("signup", () => {
  it("creates the user, an owned workspace with AI workers, and a session", async () => {
    const user = await signup(creds, meta);
    expect(user.email).toBe("maya@example.com");
    const membership = await db.workspaceMember.findFirstOrThrow({ where: { userId: user.id }, include: { role: true, workspace: { include: { subscription: true } } } });
    expect(membership.role.key).toBe("owner");
    expect(membership.workspace.subscription?.plan).toBe("FREE");
    expect(await db.aIWorker.count({ where: { workspaceId: membership.workspaceId } })).toBe(8);
    expect(await db.auditLog.count({ where: { action: "workspace.created", workspaceId: membership.workspaceId } })).toBe(1);
    expect(cookieJar.get(SESSION_COOKIE)).toBeDefined();
    expect((await getSession())?.user.id).toBe(user.id);
  });

  it("rejects a duplicate email regardless of case", async () => {
    await signup(creds, meta);
    await expect(signup({ ...creds, email: "MAYA@example.com" }, meta)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("login", () => {
  beforeEach(async () => {
    await signup(creds, meta);
    clearCookies();
  });

  it("signs in with the right password", async () => {
    await expect(login({ email: creds.email, password: creds.password }, meta)).resolves.toEqual({ status: "ok" });
    expect(cookieJar.get(SESSION_COOKIE)).toBeDefined();
  });

  it("uses the same error for unknown users and wrong passwords", async () => {
    const a = await login({ email: "nobody@example.com", password: "x" }, meta).catch((e) => e.message);
    const b = await login({ email: creds.email, password: "wrong-password1" }, meta).catch((e) => e.message);
    expect(a).toBe(b);
  });

  it("locks the account after five failed attempts", async () => {
    for (let i = 0; i < 5; i++) await login({ email: creds.email, password: "wrong-password1" }, meta).catch(() => null);
    await expect(login({ email: creds.email, password: creds.password }, meta)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("requires a second factor when 2FA is enabled", async () => {
    const user = await db.user.findUniqueOrThrow({ where: { email: "maya@example.com" } });
    const { secret } = await beginTwoFactorSetup(user.id);
    const totp = new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30 });
    const { recoveryCodes } = await enableTwoFactor(user.id, totp.generate());
    expect(recoveryCodes).toHaveLength(10);

    clearCookies();
    await expect(login({ email: creds.email, password: creds.password }, meta)).resolves.toEqual({ status: "two_factor_required" });
    expect(await getSession()).toBeNull(); // pending sessions grant no access
    const pending = await getPendingTwoFactorSession();
    expect(pending).not.toBeNull();

    await expect(completeTwoFactor(pending!, "000000", meta)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    const result = await completeTwoFactor(pending!, recoveryCodes[0]!, meta);
    expect(result).toMatchObject({ method: "recovery_code", remainingRecoveryCodes: 9 });
    expect((await getSession())?.user.id).toBe(user.id);
  });
});

describe("session rotation", () => {
  it("honours the previous token briefly, then revokes on reuse", async () => {
    await signup(creds, meta);
    const token = cookieJar.get(SESSION_COOKIE)!.value;
    const current = (await validateSessionToken(token))!;
    const next = await rotateSession(current);
    expect(next).not.toBe(token);

    expect(await validateSessionToken(token)).not.toBeNull(); // within grace window
    await db.session.update({ where: { id: current.session.id }, data: { rotatedAt: new Date(Date.now() - ROTATION_GRACE_MS - 1000) } });
    expect(await validateSessionToken(token)).toBeNull(); // replayed after grace → revoked
    expect(await validateSessionToken(next)).toBeNull(); // whole session is gone
    expect(await db.auditLog.count({ where: { action: "auth.session.reuse_detected" } })).toBe(1);
  });
});
