import type { VerificationTokenType } from "@prisma/client";
import { db } from "../db";
import { env } from "../env";
import { AppError, badRequest, conflict, forbidden, unauthenticated } from "../errors";
import { decrypt, encrypt, randomToken, sha256 } from "../crypto";
import { audit } from "../audit";
import { sendEmail } from "../email";
import { actionEmail } from "../email/templates";
import { burnPasswordCheck, hashPassword, verifyPassword } from "../auth/password";
import { createSession, revokeAllSessions, type ValidSession } from "../auth/session";
import { generateRecoveryCodes, generateTotpSecret, normalizeRecoveryCode, totpQrDataUrl, verifyTotp } from "../auth/totp";
import { DEFAULT_PLATFORM_SETTINGS, getSetting } from "../settings";
import { createWorkspace } from "./workspaces";

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

type Meta = { ip?: string | null; userAgent?: string | null };

export async function createVerificationToken(userId: string, type: VerificationTokenType, ttlMs: number): Promise<string> {
  const token = randomToken();
  // Only one live token of each type per user.
  await db.verificationToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } });
  await db.verificationToken.create({ data: { userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) } });
  return token;
}

async function consumeToken(token: string, type: VerificationTokenType) {
  const record = await db.verificationToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!record || record.type !== type || record.usedAt || record.expiresAt < new Date()) {
    throw badRequest("This link is invalid or has expired. Please request a new one.");
  }
  await db.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
  return record;
}

export async function sendVerificationEmail(user: { id: string; email: string; name: string }) {
  const token = await createVerificationToken(user.id, "EMAIL_VERIFICATION", 48 * 3600_000);
  const mail = actionEmail({
    title: "Verify your email address",
    intro: `Hi ${user.name}, confirm your email to secure your Infinity Ops Studio account.`,
    actionUrl: `${env().APP_URL}/verify-email?token=${token}`,
    actionLabel: "Verify email",
    outro: "This link expires in 48 hours.",
  });
  await sendEmail({ to: user.email, subject: "Verify your email", ...mail });
}

export async function signup(input: { name: string; email: string; password: string; workspaceName?: string; inviteToken?: string }, meta: Meta) {
  const platform = await getSetting("platform", DEFAULT_PLATFORM_SETTINGS);
  if (!platform.signupsEnabled && !input.inviteToken) throw forbidden("New signups are temporarily paused");

  const email = input.email.toLowerCase().trim();
  const exists = await db.user.findUnique({ where: { email } });
  if (exists) throw conflict("An account with this email already exists");

  const passwordHash = await hashPassword(input.password);
  const user = await db.$transaction(async (tx) => {
    const u = await tx.user.create({ data: { email, name: input.name.trim(), passwordHash } });
    // Invited users join the inviting workspace instead of getting a new one.
    if (!input.inviteToken) await createWorkspace(u.id, { name: input.workspaceName?.trim() || `${input.name.split(" ")[0]}'s Workspace` }, tx);
    return u;
  });

  await audit({ action: "auth.signup", actorId: user.id, ...meta });
  await sendVerificationEmail(user);
  await createSession(user.id, { rememberMe: true });
  return user;
}

export type LoginResult = { status: "ok" } | { status: "two_factor_required" };

export async function login(input: { email: string; password: string; rememberMe?: boolean }, meta: Meta): Promise<LoginResult> {
  const email = input.email.toLowerCase().trim();
  const user = await db.user.findUnique({ where: { email } });
  const invalid = () => new AppError("UNAUTHENTICATED", "Incorrect email or password");

  if (!user || !user.passwordHash || user.deletedAt) {
    await burnPasswordCheck(input.password);
    await audit({ action: "auth.login_failed", metadata: { email, reason: "unknown_user" }, ...meta });
    throw invalid();
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    throw new AppError("RATE_LIMITED", `Too many failed attempts. Try again in ${minutes} minute(s) or reset your password.`);
  }
  if (user.status !== "ACTIVE") throw forbidden("This account has been suspended. Contact support.");

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    const failed = user.failedLoginCount + 1;
    await db.user.update({
      where: { id: user.id },
      data: { failedLoginCount: failed, lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60000) : null },
    });
    await audit({ action: "auth.login_failed", actorId: user.id, metadata: { reason: "bad_password", failed }, ...meta });
    throw invalid();
  }

  await db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });

  if (user.twoFactorEnabled) {
    await createSession(user.id, { rememberMe: input.rememberMe, twoFactorPending: true });
    await audit({ action: "auth.login_2fa_challenge", actorId: user.id, ...meta });
    return { status: "two_factor_required" };
  }
  await createSession(user.id, { rememberMe: input.rememberMe });
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ action: "auth.login", actorId: user.id, ...meta });
  return { status: "ok" };
}

/** Completes a two-factor login with a TOTP code or a one-time recovery code. */
export async function completeTwoFactor(pending: ValidSession, code: string, meta: Meta) {
  const user = await db.user.findUniqueOrThrow({ where: { id: pending.user.id } });
  if (!user.twoFactorEnabled || !user.twoFactorSecret) throw badRequest("Two-factor authentication is not enabled");

  let method = "totp";
  if (!verifyTotp(decrypt(user.twoFactorSecret), code)) {
    const hashed = sha256(normalizeRecoveryCode(code));
    if (!user.recoveryCodes.includes(hashed)) {
      await audit({ action: "auth.2fa_failed", actorId: user.id, ...meta });
      throw new AppError("UNAUTHENTICATED", "Invalid authentication code");
    }
    method = "recovery_code";
    await db.user.update({ where: { id: user.id }, data: { recoveryCodes: user.recoveryCodes.filter((c) => c !== hashed) } });
  }

  // Replace the pending session with a fully authenticated one.
  await db.session.update({ where: { id: pending.session.id }, data: { revokedAt: new Date() } });
  await createSession(user.id, { rememberMe: pending.session.rememberMe });
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ action: "auth.login", actorId: user.id, metadata: { twoFactor: method }, ...meta });
  return { method, remainingRecoveryCodes: method === "recovery_code" ? user.recoveryCodes.length - 1 : undefined };
}

export async function verifyEmail(token: string) {
  const record = await consumeToken(token, "EMAIL_VERIFICATION");
  await db.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } });
  await audit({ action: "auth.email_verified", actorId: record.userId });
}

export async function requestPasswordReset(emailRaw: string, meta: Meta) {
  const email = emailRaw.toLowerCase().trim();
  const user = await db.user.findUnique({ where: { email } });
  // Always respond identically to avoid account enumeration.
  if (!user || user.deletedAt) return;
  const token = await createVerificationToken(user.id, "PASSWORD_RESET", 60 * 60_000);
  const mail = actionEmail({
    title: "Reset your password",
    intro: "We received a request to reset your Infinity Ops Studio password. If this wasn't you, you can ignore this email.",
    actionUrl: `${env().APP_URL}/reset-password?token=${token}`,
    actionLabel: "Choose a new password",
    outro: "This link expires in 1 hour.",
  });
  await sendEmail({ to: user.email, subject: "Reset your password", ...mail });
  await audit({ action: "auth.password_reset_requested", actorId: user.id, ...meta });
}

export async function resetPassword(token: string, password: string, meta: Meta) {
  const record = await consumeToken(token, "PASSWORD_RESET");
  await db.user.update({
    where: { id: record.userId },
    data: { passwordHash: await hashPassword(password), failedLoginCount: 0, lockedUntil: null, emailVerifiedAt: new Date() },
  });
  await revokeAllSessions(record.userId);
  await audit({ action: "auth.password_reset", actorId: record.userId, ...meta });
}

/** Account recovery for users who lost their second factor and recovery codes. */
export async function requestAccountRecovery(emailRaw: string, meta: Meta) {
  const user = await db.user.findUnique({ where: { email: emailRaw.toLowerCase().trim() } });
  if (!user || user.deletedAt || !user.twoFactorEnabled) return;
  const token = await createVerificationToken(user.id, "ACCOUNT_RECOVERY", 30 * 60_000);
  const mail = actionEmail({
    title: "Recover your account",
    intro: "Use this link to turn off two-factor authentication and set a new password. All existing sessions will be signed out.",
    actionUrl: `${env().APP_URL}/account-recovery?token=${token}`,
    actionLabel: "Recover account",
    outro: "This link expires in 30 minutes. If you didn't request it, secure your email account immediately.",
  });
  await sendEmail({ to: user.email, subject: "Account recovery request", ...mail });
  await audit({ action: "auth.recovery_requested", actorId: user.id, ...meta });
}

export async function completeAccountRecovery(token: string, password: string, meta: Meta) {
  const record = await consumeToken(token, "ACCOUNT_RECOVERY");
  await db.user.update({
    where: { id: record.userId },
    data: { passwordHash: await hashPassword(password), twoFactorEnabled: false, twoFactorSecret: null, recoveryCodes: [], failedLoginCount: 0, lockedUntil: null },
  });
  await revokeAllSessions(record.userId);
  await audit({ action: "auth.account_recovered", actorId: record.userId, ...meta });
}

export async function changePassword(userId: string, currentSessionId: string, current: string, next: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.passwordHash && !(await verifyPassword(current, user.passwordHash))) throw badRequest("Current password is incorrect");
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } });
  await revokeAllSessions(userId, currentSessionId);
  await audit({ action: "auth.password_changed", actorId: userId });
}

export async function beginTwoFactorSetup(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.twoFactorEnabled) throw conflict("Two-factor authentication is already enabled");
  const secret = generateTotpSecret();
  await db.user.update({ where: { id: userId }, data: { twoFactorSecret: encrypt(secret) } });
  const { uri, qr } = await totpQrDataUrl(secret, user.email);
  return { secret, uri, qr };
}

export async function enableTwoFactor(userId: string, code: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.twoFactorSecret) throw badRequest("Start two-factor setup first");
  if (!verifyTotp(decrypt(user.twoFactorSecret), code)) throw badRequest("That code is not valid. Check your authenticator app and try again.");
  const codes = generateRecoveryCodes();
  await db.user.update({ where: { id: userId }, data: { twoFactorEnabled: true, recoveryCodes: codes.hashed } });
  await audit({ action: "auth.2fa_enabled", actorId: userId });
  return { recoveryCodes: codes.plain };
}

export async function disableTwoFactor(userId: string, password: string, code: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.twoFactorEnabled || !user.twoFactorSecret) throw badRequest("Two-factor authentication is not enabled");
  if (user.passwordHash && !(await verifyPassword(password, user.passwordHash))) throw badRequest("Password is incorrect");
  if (!verifyTotp(decrypt(user.twoFactorSecret), code)) throw badRequest("Invalid authentication code");
  await db.user.update({ where: { id: userId }, data: { twoFactorEnabled: false, twoFactorSecret: null, recoveryCodes: [] } });
  await audit({ action: "auth.2fa_disabled", actorId: userId });
}

export async function regenerateRecoveryCodes(userId: string, code: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.twoFactorEnabled || !user.twoFactorSecret) throw badRequest("Two-factor authentication is not enabled");
  if (!verifyTotp(decrypt(user.twoFactorSecret), code)) throw badRequest("Invalid authentication code");
  const codes = generateRecoveryCodes();
  await db.user.update({ where: { id: userId }, data: { recoveryCodes: codes.hashed } });
  await audit({ action: "auth.recovery_codes_regenerated", actorId: userId });
  return { recoveryCodes: codes.plain };
}

/** Sign in or sign up via an OAuth identity (currently Google). */
export async function oauthLogin(profile: { provider: string; providerAccountId: string; email: string; emailVerified: boolean; name: string; avatarUrl?: string }, meta: Meta) {
  const email = profile.email.toLowerCase();
  const account = await db.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider: profile.provider, providerAccountId: profile.providerAccountId } },
    include: { user: true },
  });

  let user = account?.user ?? null;
  if (!user) {
    if (!profile.emailVerified) throw forbidden("Your Google email address is not verified");
    user = await db.user.findUnique({ where: { email } });
    if (user) {
      await db.oAuthAccount.create({ data: { userId: user.id, provider: profile.provider, providerAccountId: profile.providerAccountId } });
      if (!user.emailVerifiedAt) await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    } else {
      const platform = await getSetting("platform", DEFAULT_PLATFORM_SETTINGS);
      if (!platform.signupsEnabled) throw forbidden("New signups are temporarily paused");
      user = await db.$transaction(async (tx) => {
        const u = await tx.user.create({
          data: { email, name: profile.name, avatarUrl: profile.avatarUrl, emailVerifiedAt: new Date(), oauthAccounts: { create: { provider: profile.provider, providerAccountId: profile.providerAccountId } } },
        });
        await createWorkspace(u.id, { name: `${profile.name.split(" ")[0]}'s Workspace` }, tx);
        return u;
      });
      await audit({ action: "auth.signup", actorId: user.id, metadata: { provider: profile.provider }, ...meta });
    }
  }
  if (user.deletedAt || user.status !== "ACTIVE") throw unauthenticated("This account is not available");

  if (user.twoFactorEnabled) {
    await createSession(user.id, { rememberMe: true, twoFactorPending: true });
    return { status: "two_factor_required" as const };
  }
  await createSession(user.id, { rememberMe: true });
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ action: "auth.login", actorId: user.id, metadata: { provider: profile.provider }, ...meta });
  return { status: "ok" as const };
}
