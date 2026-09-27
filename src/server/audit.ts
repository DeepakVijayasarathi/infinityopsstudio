import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { logger } from "./logger";

export type AuditInput = {
  action: string;
  workspaceId?: string | null;
  actorId?: string | null;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
  userAgent?: string | null;
};

/** Append-only audit trail. Failures are logged, never thrown, so auditing cannot break a request. */
export async function audit(input: AuditInput): Promise<void> {
  try {
    await db.auditLog.create({ data: input });
  } catch (err) {
    logger.error("Failed to write audit log", { err, action: input.action });
  }
}
