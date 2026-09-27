import { createHash } from "node:crypto";
import { db } from "../db";

/** Deterministic percentage rollout per workspace. */
export async function isFeatureEnabled(key: string, workspaceId?: string): Promise<boolean> {
  const flag = await db.featureFlag.findUnique({ where: { key } });
  if (!flag || !flag.enabled) return false;
  if (workspaceId && flag.workspaceIds.includes(workspaceId)) return true;
  if (flag.rolloutPercent >= 100) return true;
  if (!workspaceId) return false;
  const bucket = parseInt(createHash("sha1").update(`${key}:${workspaceId}`).digest("hex").slice(0, 8), 16) % 100;
  return bucket < flag.rolloutPercent;
}
