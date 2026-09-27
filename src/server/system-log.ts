import type { Prisma } from "@prisma/client";
import { db } from "./db";

/** Persist operational errors so they are visible in Admin → System logs. */
export async function systemLog(level: "info" | "warn" | "error", source: string, message: string, context?: Record<string, unknown>) {
  try {
    await db.systemLog.create({ data: { level, source, message: message.slice(0, 1000), context: context as Prisma.InputJsonValue | undefined } });
  } catch {
    /* never throw from logging */
  }
}
