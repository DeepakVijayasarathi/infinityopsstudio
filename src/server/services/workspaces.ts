import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { badRequest, conflict, forbidden, notFound, paymentRequired } from "../errors";
import { randomToken, sha256 } from "../crypto";
import { audit } from "../audit";
import { sendEmail } from "../email";
import { actionEmail } from "../email/templates";
import { env } from "../env";
import { notify } from "./notifications";
import { SYSTEM_ROLES, type RoleKey } from "@/config/permissions";
import { WORKER_TEMPLATES } from "@/config/workers";
import { getPlan, withinLimit } from "@/config/plans";
import type { WorkspaceContext } from "../tenant";

type Tx = Prisma.TransactionClient;

/** Idempotently creates/updates the built-in system roles (shared across workspaces). */
export async function ensureSystemRoles(tx: Tx | typeof db = db) {
  const out: Record<string, string> = {};
  for (const [key, def] of Object.entries(SYSTEM_ROLES)) {
    const existing = await tx.role.findFirst({ where: { workspaceId: null, key } });
    const data = { name: def.name, description: def.description, permissions: def.permissions, rank: def.rank, isSystem: true };
    const role = existing
      ? await tx.role.update({ where: { id: existing.id }, data })
      : await tx.role.create({ data: { ...data, key, workspaceId: null } });
    out[key] = role.id;
  }
  return out as Record<RoleKey, string>;
}

export async function systemRoleId(key: RoleKey): Promise<string> {
  const role = await db.role.findFirst({ where: { workspaceId: null, key } });
  if (role) return role.id;
  return (await ensureSystemRoles())[key];
}

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "workspace"
  );
}

async function uniqueSlug(tx: Tx, base: string): Promise<string> {
  let slug = slugify(base);
  for (let i = 0; i < 20; i++) {
    const exists = await tx.workspace.findUnique({ where: { slug } });
    if (!exists) return slug;
    slug = `${slugify(base).slice(0, 34)}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, "")}`;
  }
  throw conflict("Could not generate a unique workspace URL");
}

/** Creates a workspace with owner membership, free subscription, brand kit and the AI worker roster. */
export async function createWorkspace(userId: string, input: { name: string; industry?: string; website?: string }, tx?: Tx) {
  const run = async (t: Tx) => {
    const roles = await ensureSystemRoles(t);
    const slug = await uniqueSlug(t, input.name);
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
    const workspace = await t.workspace.create({
      data: {
        name: input.name,
        slug,
        industry: input.industry,
        website: input.website,
        members: { create: { userId, roleId: roles.owner } },
        subscription: { create: { plan: "FREE", status: "ACTIVE", currentPeriodStart: now, currentPeriodEnd: periodEnd } },
        brandKit: { create: { companyName: input.name, industry: input.industry, website: input.website } },
      },
    });
    await t.aIWorker.createMany({
      data: WORKER_TEMPLATES.map((w, i) => ({
        workspaceId: workspace.id,
        key: w.key,
        name: w.name,
        title: w.title,
        description: w.description,
        color: w.color,
        capabilities: w.capabilities.map((c) => c.key),
        systemPrompt: w.systemPrompt,
        // Free plan starts with the first two workers active.
        isActive: i < 2,
      })),
    });
    await t.user.update({ where: { id: userId }, data: { lastWorkspaceId: workspace.id } });
    return workspace;
  };
  const workspace = tx ? await run(tx) : await db.$transaction(run);
  await audit({ action: "workspace.created", workspaceId: workspace.id, actorId: userId, entityType: "Workspace", entityId: workspace.id });
  return workspace;
}

export async function updateWorkspace(ctx: WorkspaceContext, data: { name?: string; industry?: string | null; website?: string | null; timezone?: string; logoUrl?: string | null }) {
  const ws = await db.workspace.update({ where: { id: ctx.workspace.id }, data });
  await audit({ action: "workspace.updated", workspaceId: ws.id, actorId: ctx.user.id, metadata: data });
  return ws;
}

export async function deleteWorkspace(ctx: WorkspaceContext, confirmName: string) {
  if (confirmName !== ctx.workspace.name) throw badRequest("Workspace name does not match");
  await db.workspace.update({ where: { id: ctx.workspace.id }, data: { deletedAt: new Date() } });
  await audit({ action: "workspace.deleted", workspaceId: ctx.workspace.id, actorId: ctx.user.id });
}

export async function listMembers(workspaceId: string) {
  const [members, invites] = await Promise.all([
    db.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, lastLoginAt: true } }, role: { select: { id: true, key: true, name: true, rank: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.workspaceInvite.findMany({
      where: { workspaceId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { role: { select: { key: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return { members, invites: invites.map(({ tokenHash: _t, ...i }) => i) };
}

export async function listRoles(workspaceId: string) {
  return db.role.findMany({ where: { OR: [{ workspaceId: null }, { workspaceId }] }, orderBy: { rank: "desc" } });
}

async function assertRoleAssignable(ctx: WorkspaceContext, roleId: string) {
  const role = await db.role.findFirst({ where: { id: roleId, OR: [{ workspaceId: null }, { workspaceId: ctx.workspace.id }] } });
  if (!role) throw notFound("Role");
  // Nobody can grant a role more powerful than their own.
  if (role.rank > ctx.role.rank) throw forbidden("You cannot assign a role higher than your own");
  return role;
}

export async function inviteMember(ctx: WorkspaceContext, input: { email: string; roleId: string }) {
  const email = input.email.toLowerCase().trim();
  const role = await assertRoleAssignable(ctx, input.roleId);
  const plan = getPlan(ctx.plan);
  const seats = await db.workspaceMember.count({ where: { workspaceId: ctx.workspace.id } });
  const pending = await db.workspaceInvite.count({ where: { workspaceId: ctx.workspace.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } });
  if (!withinLimit(plan.limits.seats, seats + pending)) throw paymentRequired(`Your ${plan.name} plan includes ${plan.limits.seats} seat(s). Upgrade to invite more teammates.`);

  const existing = await db.workspaceMember.findFirst({ where: { workspaceId: ctx.workspace.id, user: { email } } });
  if (existing) throw conflict("This person is already a member of the workspace");

  const token = randomToken();
  const invite = await db.workspaceInvite.create({
    data: { workspaceId: ctx.workspace.id, email, roleId: role.id, tokenHash: sha256(token), invitedById: ctx.user.id, expiresAt: new Date(Date.now() + 7 * 86400_000) },
  });
  const url = `${env().APP_URL}/invite/${token}`;
  const mail = actionEmail({
    title: `Join ${ctx.workspace.name} on InfinityOps Studio`,
    intro: `${ctx.user.name} invited you to join the ${ctx.workspace.name} workspace as ${role.name}.`,
    actionUrl: url,
    actionLabel: "Accept invitation",
    outro: "This invitation expires in 7 days.",
  });
  await sendEmail({ to: email, subject: `${ctx.user.name} invited you to ${ctx.workspace.name}`, ...mail });
  await audit({ action: "member.invited", workspaceId: ctx.workspace.id, actorId: ctx.user.id, entityType: "WorkspaceInvite", entityId: invite.id, metadata: { email, role: role.key } });
  const { tokenHash: _t, ...safe } = invite;
  return { invite: safe, inviteUrl: url };
}

export async function revokeInvite(ctx: WorkspaceContext, inviteId: string) {
  const invite = await db.workspaceInvite.findFirst({ where: { id: inviteId, workspaceId: ctx.workspace.id } });
  if (!invite) throw notFound("Invitation");
  await db.workspaceInvite.update({ where: { id: invite.id }, data: { revokedAt: new Date() } });
  await audit({ action: "member.invite_revoked", workspaceId: ctx.workspace.id, actorId: ctx.user.id, entityId: invite.id });
}

export async function getInviteByToken(token: string) {
  const invite = await db.workspaceInvite.findUnique({
    where: { tokenHash: sha256(token) },
    include: { workspace: { select: { id: true, name: true, deletedAt: true } }, role: { select: { name: true } } },
  });
  if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt < new Date() || invite.workspace.deletedAt) return null;
  return invite;
}

export async function acceptInvite(user: { id: string; email: string; name: string }, token: string) {
  const invite = await getInviteByToken(token);
  if (!invite) throw badRequest("This invitation is invalid or has expired");
  if (invite.email !== user.email.toLowerCase()) throw forbidden(`This invitation was sent to ${invite.email}. Sign in with that email to accept it.`);
  await db.$transaction(async (tx) => {
    await tx.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: user.id } },
      create: { workspaceId: invite.workspaceId, userId: user.id, roleId: invite.roleId },
      update: {},
    });
    await tx.workspaceInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
    await tx.user.update({ where: { id: user.id }, data: { lastWorkspaceId: invite.workspaceId } });
  });
  await audit({ action: "member.joined", workspaceId: invite.workspaceId, actorId: user.id, entityType: "WorkspaceInvite", entityId: invite.id });
  await notify({ workspaceId: invite.workspaceId, type: "workspace.invite", title: `${user.name} joined ${invite.workspace.name}`, link: "/app/settings/team", permission: "members:manage" });
  return invite.workspaceId;
}

export async function changeMemberRole(ctx: WorkspaceContext, memberId: string, roleId: string) {
  const member = await db.workspaceMember.findFirst({ where: { id: memberId, workspaceId: ctx.workspace.id }, include: { role: true } });
  if (!member) throw notFound("Member");
  if (member.userId === ctx.user.id) throw badRequest("You cannot change your own role");
  if (member.role.rank > ctx.role.rank) throw forbidden("You cannot change the role of someone with a higher role");
  const role = await assertRoleAssignable(ctx, roleId);
  if (member.role.key === "owner" && role.key !== "owner") {
    const owners = await db.workspaceMember.count({ where: { workspaceId: ctx.workspace.id, role: { key: "owner" } } });
    if (owners <= 1) throw badRequest("A workspace must have at least one owner");
  }
  const updated = await db.workspaceMember.update({ where: { id: member.id }, data: { roleId: role.id } });
  await audit({ action: "member.role_changed", workspaceId: ctx.workspace.id, actorId: ctx.user.id, entityId: member.userId, metadata: { from: member.role.key, to: role.key } });
  return updated;
}

export async function removeMember(ctx: WorkspaceContext, memberId: string) {
  const member = await db.workspaceMember.findFirst({ where: { id: memberId, workspaceId: ctx.workspace.id }, include: { role: true } });
  if (!member) throw notFound("Member");
  const self = member.userId === ctx.user.id;
  if (!self && member.role.rank >= ctx.role.rank) throw forbidden("You cannot remove someone with an equal or higher role");
  if (member.role.key === "owner") {
    const owners = await db.workspaceMember.count({ where: { workspaceId: ctx.workspace.id, role: { key: "owner" } } });
    if (owners <= 1) throw badRequest("Transfer ownership before leaving — a workspace must have at least one owner");
  }
  await db.workspaceMember.delete({ where: { id: member.id } });
  await audit({ action: self ? "member.left" : "member.removed", workspaceId: ctx.workspace.id, actorId: ctx.user.id, entityId: member.userId });
}
