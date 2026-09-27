import type { Prisma } from "@prisma/client";
import { db } from "./db";

const cache = new Map<string, { value: unknown; expires: number }>();
const TTL_MS = 30_000;

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const row = await db.systemSetting.findUnique({ where: { key } }).catch(() => null);
  const value = row ? ({ ...(fallback as object), ...(row.value as object) } as T) : fallback;
  cache.set(key, { value, expires: Date.now() + TTL_MS });
  return value;
}

export async function setSetting(key: string, value: Prisma.InputJsonValue) {
  await db.systemSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  cache.delete(key);
}

export type AISettings = {
  defaultModel: string | null;
  enabledModels: string[] | null; // null = all catalog models
  allowUserModelSelection: boolean;
  pricingOverrides: Record<string, { inputPerMTok: number; outputPerMTok: number }>;
};

export const DEFAULT_AI_SETTINGS: AISettings = {
  defaultModel: null,
  enabledModels: null,
  allowUserModelSelection: true,
  pricingOverrides: {},
};

export type PlatformSettings = {
  signupsEnabled: boolean;
  maintenanceMessage: string | null;
  requireEmailVerification: boolean;
};

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  signupsEnabled: true,
  maintenanceMessage: null,
  requireEmailVerification: false,
};
