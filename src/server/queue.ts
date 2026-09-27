import { Queue, type JobsOptions } from "bullmq";
import { env } from "./env";
import { logger } from "./logger";

export const QUEUES = ["ai", "email", "social", "workflows", "analytics", "reports", "scheduler"] as const;
export type QueueName = (typeof QUEUES)[number];

export type JobPayloads = {
  ai: { kind: "run-task"; taskId: string };
  email: { kind: "send-campaign"; emailCampaignId: string } | { kind: "send-notification"; to: string; subject: string; html: string; text: string };
  social: { kind: "publish-post"; postId: string };
  workflows: { kind: "run-execution"; executionId: string };
  analytics: { kind: "sync-workspace"; workspaceId: string };
  reports: { kind: "campaign-report"; campaignId: string; workspaceId: string };
  scheduler: { kind: "tick" };
};

const g = globalThis as unknown as { queues?: Map<QueueName, Queue> };

export function connectionOptions() {
  const url = env().REDIS_URL;
  if (!url) return null;
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname.length > 1 ? Number(u.pathname.slice(1)) : undefined,
    tls: u.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

function getQueue(name: QueueName): Queue | null {
  const connection = connectionOptions();
  if (!connection) return null;
  g.queues ??= new Map();
  let q = g.queues.get(name);
  if (!q) {
    q = new Queue(name, {
      connection,
      defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: 1000, removeOnFail: 5000 },
    });
    g.queues.set(name, q);
  }
  return q;
}

/**
 * Enqueue a background job. When Redis is not configured (local dev, tests) the job runs
 * in-process asynchronously so behaviour stays identical without extra infrastructure.
 */
export async function enqueue<N extends QueueName>(name: N, data: JobPayloads[N], opts: JobsOptions = {}): Promise<void> {
  const q = process.env.QUEUE_INLINE === "1" ? null : getQueue(name);
  if (q) {
    try {
      await q.add(data.kind, data, opts);
      return;
    } catch (err) {
      logger.warn("Queue unavailable, running job inline", { queue: name, err });
    }
  }
  const run = async () => {
    const { processJob } = await import("./jobs/processors");
    try {
      await processJob(name, data);
    } catch (err) {
      logger.error("Inline job failed", { queue: name, kind: data.kind, err });
    }
  };
  if (opts.delay && opts.delay > 0) setTimeout(run, Math.min(opts.delay, 2 ** 31 - 1));
  else if (process.env.QUEUE_INLINE_SYNC === "1") await run();
  else void run();
}

export async function queueHealth(): Promise<Record<string, { waiting: number; active: number; failed: number; delayed: number }> | null> {
  if (!connectionOptions()) return null;
  const out: Record<string, { waiting: number; active: number; failed: number; delayed: number }> = {};
  for (const name of QUEUES) {
    const q = getQueue(name)!;
    const c = await q.getJobCounts("waiting", "active", "failed", "delayed");
    out[name] = { waiting: c.waiting ?? 0, active: c.active ?? 0, failed: c.failed ?? 0, delayed: c.delayed ?? 0 };
  }
  return out;
}
