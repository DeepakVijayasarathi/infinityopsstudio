import { redis } from "./redis";
import { AppError } from "./errors";

type Bucket = { count: number; resetAt: number };
const memory = new Map<string, Bucket>();

export type RateLimitResult = { allowed: boolean; remaining: number; resetAt: number; limit: number };

/** Fixed-window rate limiter. Uses Redis when available, falls back to process memory. */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = Math.floor(now / (windowSec * 1000)) * windowSec * 1000;
  const resetAt = windowStart + windowSec * 1000;
  const bucketKey = `rl:${key}:${windowStart}`;

  const client = redis();
  if (client && client.status === "ready") {
    try {
      const count = await client.incr(bucketKey);
      if (count === 1) await client.pexpire(bucketKey, windowSec * 1000);
      return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetAt, limit };
    } catch {
      // fall through to memory limiter
    }
  }

  const bucket = memory.get(bucketKey) ?? { count: 0, resetAt };
  bucket.count += 1;
  memory.set(bucketKey, bucket);
  if (memory.size > 10_000) {
    for (const [k, b] of memory) if (b.resetAt < now) memory.delete(k);
  }
  return { allowed: bucket.count <= limit, remaining: Math.max(0, limit - bucket.count), resetAt, limit };
}

export async function enforceRateLimit(key: string, limit: number, windowSec: number) {
  const r = await rateLimit(key, limit, windowSec);
  if (!r.allowed) {
    throw new AppError("RATE_LIMITED", "Too many requests. Please try again shortly.", {
      retryAfter: Math.ceil((r.resetAt - Date.now()) / 1000),
    });
  }
  return r;
}
