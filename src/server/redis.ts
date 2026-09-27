import IORedis from "ioredis";
import { env } from "./env";

const g = globalThis as unknown as { redis?: IORedis | null };

/** Shared Redis connection, or null when REDIS_URL is not configured. */
export function redis(): IORedis | null {
  if (g.redis !== undefined) return g.redis;
  const url = env().REDIS_URL;
  if (!url) {
    g.redis = null;
    return null;
  }
  g.redis = new IORedis(url, { maxRetriesPerRequest: null, lazyConnect: false, enableOfflineQueue: true });
  g.redis.on("error", () => {
    /* connection errors are surfaced by health checks */
  });
  return g.redis;
}
