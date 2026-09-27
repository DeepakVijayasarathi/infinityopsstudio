import type { JobPayloads, QueueName } from "../queue";
import { enqueue } from "../queue";
import { db } from "../db";
import { logger } from "../logger";
import { sendEmail } from "../email";
import { runTask } from "../services/workers";
import { processPublish, enqueueDuePosts } from "../services/social";
import { runExecution, processScheduledWorkflows } from "../services/automations";
import { processSendCampaign, processScheduledEmail } from "../services/email";
import { processCampaignReport } from "../services/reports";
import { processBillingPeriods } from "../billing/service";
import { syncWorkspaceAnalytics } from "./analytics-sync";

let lastAnalyticsSync = 0;

/** Periodic scheduler (every minute from the worker process). */
export async function schedulerTick() {
  const results = {
    posts: await enqueueDuePosts(),
    email: await processScheduledEmail(),
    workflows: await processScheduledWorkflows(),
    billing: await processBillingPeriods(),
    analytics: 0,
  };
  // Hourly first-party analytics rollup.
  if (Date.now() - lastAnalyticsSync > 60 * 60_000) {
    lastAnalyticsSync = Date.now();
    const workspaces = await db.workspace.findMany({ where: { deletedAt: null }, select: { id: true } });
    for (const w of workspaces) await enqueue("analytics", { kind: "sync-workspace", workspaceId: w.id });
    results.analytics = workspaces.length;
  }
  // Housekeeping: expired sessions & tokens.
  await db.session.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 7 * 86400_000) } } });
  await db.verificationToken.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 7 * 86400_000) } } });
  return results;
}

export async function processJob<N extends QueueName>(queue: N, data: JobPayloads[N]): Promise<void> {
  const payload = data as JobPayloads[QueueName];
  switch (payload.kind) {
    case "run-task":
      return runTask(payload.taskId);
    case "send-campaign":
      return processSendCampaign(payload.emailCampaignId);
    case "send-notification":
      await sendEmail({ to: payload.to, subject: payload.subject, html: payload.html, text: payload.text });
      return;
    case "publish-post":
      return processPublish(payload.postId);
    case "run-execution":
      return runExecution(payload.executionId);
    case "sync-workspace":
      return syncWorkspaceAnalytics(payload.workspaceId);
    case "campaign-report":
      return processCampaignReport(payload.workspaceId, payload.campaignId);
    case "tick":
      await schedulerTick();
      return;
    default:
      logger.warn("Unknown job", { queue, data });
  }
}
