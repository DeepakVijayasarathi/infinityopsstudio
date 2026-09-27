import { db } from "../db";

const LABELS: Record<string, string> = {
  "campaign.created": "created campaign",
  "campaign.status_changed": "changed campaign status",
  "campaign.strategy_generated": "generated a campaign strategy",
  "campaign.approved": "approved a campaign",
  "content.created": "created content",
  "content.status_changed": "updated content status",
  "worker.task_created": "assigned an AI task",
  "worker.task_approved": "approved AI output",
  "worker.task_rejected": "rejected AI output",
  "lead.imported": "imported leads",
  "workflow.created": "created an automation",
  "workflow.enabled": "enabled an automation",
  "integration.connected": "connected an integration",
  "member.joined": "joined the workspace",
  "member.invited": "invited a teammate",
  "billing.plan_changed": "changed the plan",
  "social.post_created": "created a social post",
  "email.campaign_scheduled": "scheduled an email campaign",
  "seo.audit_run": "ran an SEO audit",
  "brand.updated": "updated the brand kit",
};

export async function recentActivity(workspaceId: string, take = 12) {
  const logs = await db.auditLog.findMany({
    where: { workspaceId, action: { in: Object.keys(LABELS) } },
    orderBy: { createdAt: "desc" },
    take,
    include: { actor: { select: { name: true, avatarUrl: true } } },
  });
  return logs.map((l) => ({ id: l.id, action: l.action, label: LABELS[l.action] ?? l.action, actor: l.actor?.name ?? "Automation", entityType: l.entityType, entityId: l.entityId, createdAt: l.createdAt }));
}
