import { db } from "@/server/db";
import { signup } from "@/server/services/auth";
import { resolveWorkspace, type WorkspaceContext } from "@/server/tenant";
import type { SessionUser } from "@/server/auth/session";
import { clearCookies } from "./next-headers";

/** Empties every application table (keeps the migrations table). */
export async function resetDb() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  clearCookies();
}

let counter = 0;

/** Signs up a fresh user (which creates their workspace) and returns a workspace context. */
export async function createOwner(name = "Test Owner"): Promise<WorkspaceContext> {
  counter += 1;
  const email = `${name.toLowerCase().replace(/\W+/g, ".")}.${counter}@example.com`;
  const user = await signup({ name, email, password: "Password123", workspaceName: `${name}'s Co` }, {});
  clearCookies();
  return contextFor(user.id);
}

export async function contextFor(userId: string, workspaceId?: string): Promise<WorkspaceContext> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const ctx = await resolveWorkspace(user as SessionUser, workspaceId);
  if (!ctx) throw new Error("No workspace for user");
  return ctx;
}

/** Adds an existing user to a workspace with one of the system roles. */
export async function addMember(workspaceId: string, roleKey: "admin" | "manager" | "member" | "viewer", name = "Teammate") {
  counter += 1;
  const role = await db.role.findFirstOrThrow({ where: { key: roleKey, workspaceId: null } });
  const user = await db.user.create({ data: { name, email: `${roleKey}.${counter}@example.com`, emailVerifiedAt: new Date() } });
  await db.workspaceMember.create({ data: { workspaceId, userId: user.id, roleId: role.id } });
  return contextFor(user.id, workspaceId);
}
