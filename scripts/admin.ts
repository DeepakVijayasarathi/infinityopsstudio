/* eslint-disable no-console */
/**
 * Server administration commands (run through ./manage.sh in Docker, or `npx tsx scripts/admin.ts` locally).
 *
 *   make-admin <email>      Promote a user to super admin, or create them (NEW_PASSWORD, NAME, WORKSPACE_NAME env)
 *   reset-password <email>  Set a new password (NEW_PASSWORD env), unlock the account and sign out all sessions
 *   remove-demo             Delete the "Northwind Growth" demo workspace and demo users
 *   status                  Show users, workspaces and whether demo data is present
 *
 * Passwords come from the environment, never from command-line arguments, so they don't appear in process lists.
 */
import { db } from "../src/server/db";
import { hashPassword, passwordSchema } from "../src/server/auth/password";
import { revokeAllSessions } from "../src/server/auth/session";
import { createWorkspace } from "../src/server/services/workspaces";

const DEMO_WORKSPACE_SLUG = "northwind-growth";
const DEMO_USERS = ["demo@infinityops.studio", "sarah@northwindgrowth.com", "raj@northwindgrowth.com", "lena@northwindgrowth.com"];
const DEMO_ADMIN = "admin@infinityops.studio";

const fail = (msg: string): never => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

function requirePassword(): string {
  const pw = process.env.NEW_PASSWORD ?? "";
  const parsed = passwordSchema.safeParse(pw);
  if (!parsed.success) fail(parsed.error.issues[0]?.message ?? "Invalid password");
  return pw;
}

async function makeAdmin(emailRaw: string | undefined) {
  if (!emailRaw || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailRaw)) fail("Usage: make-admin <email>");
  const email = emailRaw!.toLowerCase().trim();
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    await db.user.update({ where: { id: existing.id }, data: { platformRole: "SUPER_ADMIN", status: "ACTIVE", deletedAt: null, lockedUntil: null, failedLoginCount: 0, emailVerifiedAt: existing.emailVerifiedAt ?? new Date(), ...(process.env.NEW_PASSWORD ? { passwordHash: await hashPassword(requirePassword()) } : {}) } });
    console.log(`✓ ${email} is now a super admin.`);
    return;
  }
  const password = requirePassword();
  const name = process.env.NAME?.trim() || email.split("@")[0]!.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const user = await db.user.create({ data: { email, name, passwordHash: await hashPassword(password), platformRole: "SUPER_ADMIN", emailVerifiedAt: new Date() } });
  const ws = await createWorkspace(user.id, { name: process.env.WORKSPACE_NAME?.trim() || `${name.split(" ")[0]}'s Workspace` });
  // The platform owner's own workspace isn't limited by the Free plan.
  await db.subscription.update({ where: { workspaceId: ws.id }, data: { plan: "ENTERPRISE", status: "ACTIVE", provider: "manual" } });
  console.log(`✓ Created super admin ${email} with workspace “${ws.name}” (Enterprise plan).`);
}

async function resetPassword(emailRaw: string | undefined) {
  if (!emailRaw) fail("Usage: reset-password <email>");
  const email = emailRaw!.toLowerCase().trim();
  const user = await db.user.findUnique({ where: { email } });
  if (!user) fail(`No user with email ${email}`);
  await db.user.update({ where: { id: user!.id }, data: { passwordHash: await hashPassword(requirePassword()), failedLoginCount: 0, lockedUntil: null, status: "ACTIVE" } });
  await revokeAllSessions(user!.id);
  console.log(`✓ Password updated for ${email}; all their sessions were signed out.`);
}

async function removeDemo() {
  const otherAdmins = await db.user.count({ where: { platformRole: "SUPER_ADMIN", deletedAt: null, email: { notIn: [DEMO_ADMIN, ...DEMO_USERS] } } });
  if (!otherAdmins) fail("Create your own admin first so you don't lock yourself out:  ./manage.sh make-admin you@yourcompany.com");
  const ws = await db.workspace.findUnique({ where: { slug: DEMO_WORKSPACE_SLUG } });
  if (ws) await db.workspace.delete({ where: { id: ws.id } }); // cascades to all of its data
  const users = await db.user.deleteMany({ where: { email: { in: [...DEMO_USERS, DEMO_ADMIN] } } });
  console.log(`✓ Removed ${ws ? "the Northwind Growth demo workspace and " : ""}${users.count} demo user(s). Public blog articles were kept.`);
}

async function status() {
  const [users, workspaces, demo] = await Promise.all([
    db.user.findMany({ where: { deletedAt: null }, select: { email: true, platformRole: true, status: true }, orderBy: { createdAt: "asc" }, take: 50 }),
    db.workspace.findMany({ where: { deletedAt: null }, select: { name: true, slug: true, subscription: { select: { plan: true } }, _count: { select: { members: true, leads: true, campaigns: true } } }, take: 50 }),
    db.workspace.findUnique({ where: { slug: DEMO_WORKSPACE_SLUG }, select: { id: true } }),
  ]);
  console.log("Users:");
  for (const u of users) console.log(`  ${u.email.padEnd(40)} ${u.platformRole === "SUPER_ADMIN" ? "super admin" : "user"}${u.status !== "ACTIVE" ? ` (${u.status.toLowerCase()})` : ""}`);
  console.log("Workspaces:");
  for (const w of workspaces) console.log(`  ${w.name.padEnd(40)} ${w.subscription?.plan ?? "FREE"} · ${w._count.members} members · ${w._count.campaigns} campaigns · ${w._count.leads} leads`);
  console.log(demo ? "Demo data: present (remove with ./manage.sh remove-demo)" : "Demo data: not present");
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  switch (cmd) {
    case "make-admin":
      return makeAdmin(arg);
    case "reset-password":
      return resetPassword(arg);
    case "remove-demo":
      return removeDemo();
    case "status":
      return status();
    default:
      fail("Commands: make-admin <email> | reset-password <email> | remove-demo | status");
  }
}

main()
  .catch((err) => fail(err instanceof Error ? err.message : String(err)))
  .finally(() => db.$disconnect());
