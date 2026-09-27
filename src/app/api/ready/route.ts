import { db } from "@/server/db";
import { redis } from "@/server/redis";

// Readiness: dependencies (database, Redis) are reachable.
export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, { ok: boolean; ms?: number; error?: string }> = {};
  const t0 = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    checks.database = { ok: true, ms: Date.now() - t0 };
  } catch (err) {
    checks.database = { ok: false, error: err instanceof Error ? err.message.slice(0, 120) : "unreachable" };
  }
  const client = redis();
  if (client) {
    const t1 = Date.now();
    try {
      await client.ping();
      checks.redis = { ok: true, ms: Date.now() - t1 };
    } catch (err) {
      checks.redis = { ok: false, error: err instanceof Error ? err.message.slice(0, 120) : "unreachable" };
    }
  }
  const ready = Object.values(checks).every((c) => c.ok);
  return Response.json({ status: ready ? "ready" : "degraded", checks }, { status: ready ? 200 : 503 });
}
