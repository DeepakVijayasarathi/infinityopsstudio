/* Background worker: processes BullMQ queues and runs the scheduler tick every minute. */
import { Worker, type Job } from "bullmq";
import { connectionOptions, enqueue, QUEUES, type JobPayloads, type QueueName } from "../src/server/queue";
import { processJob } from "../src/server/jobs/processors";
import { logger } from "../src/server/logger";
import { systemLog } from "../src/server/system-log";
import { db } from "../src/server/db";

const CONCURRENCY: Record<QueueName, number> = { ai: 4, email: 2, social: 2, workflows: 4, analytics: 2, reports: 1, scheduler: 1 };

async function main() {
  const connection = connectionOptions();
  if (!connection) {
    logger.error("REDIS_URL is not configured — the worker requires Redis");
    process.exit(1);
  }

  const workers = QUEUES.map(
    (name) =>
      new Worker(
        name,
        async (job: Job) => {
          const started = Date.now();
          await processJob(name, job.data as JobPayloads[typeof name]);
          logger.info("job.completed", { queue: name, kind: job.data?.kind, id: job.id, ms: Date.now() - started });
        },
        { connection, concurrency: CONCURRENCY[name] },
      ),
  );

  for (const w of workers) {
    w.on("failed", (job, err) => {
      logger.error("job.failed", { queue: w.name, id: job?.id, attempts: job?.attemptsMade, err });
      void systemLog("error", `worker:${w.name}`, err.message, { jobId: job?.id, kind: job?.data?.kind, attempts: job?.attemptsMade });
    });
  }

  // Scheduler: a single repeatable job ensures only one tick runs per minute across replicas.
  await enqueue("scheduler", { kind: "tick" }, { repeat: { every: 60_000 }, jobId: "scheduler-tick" });
  logger.info("worker.started", { queues: QUEUES });

  const shutdown = async (signal: string) => {
    logger.info("worker.stopping", { signal });
    await Promise.all(workers.map((w) => w.close()));
    await db.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error("worker.crashed", { err });
  process.exit(1);
});
