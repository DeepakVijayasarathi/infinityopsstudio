import { db } from "../db";
import { enqueue } from "../queue";
import { notificationEmail } from "../email/templates";
import { hasPermission, type Permission } from "@/config/permissions";

export const NOTIFICATION_TYPES = {
  "campaign.completed": { label: "Campaign completed", emailDefault: true },
  "ai_task.completed": { label: "AI task completed", emailDefault: false },
  "ai_task.approval": { label: "AI output awaiting approval", emailDefault: true },
  "workflow.failed": { label: "Workflow failed", emailDefault: true },
  "lead.created": { label: "New lead", emailDefault: false },
  "payment.event": { label: "Payment events", emailDefault: true },
  "integration.disconnected": { label: "Integration disconnected", emailDefault: true },
  "usage.warning": { label: "Usage limit warning", emailDefault: true },
  "social.failed": { label: "Social post failed", emailDefault: true },
  "workspace.invite": { label: "Workspace membership", emailDefault: true },
  "insight.alert": { label: "Performance alerts (unusual drops)", emailDefault: true },
  "report.weekly": { label: "Weekly insights report", emailDefault: false },
} as const;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;
export type NotificationPrefs = Partial<Record<NotificationType, { inApp: boolean; email: boolean }>>;

export function resolvePref(prefs: NotificationPrefs | null | undefined, type: NotificationType) {
  return prefs?.[type] ?? { inApp: true, email: NOTIFICATION_TYPES[type].emailDefault };
}

type NotifyInput = {
  workspaceId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  /** Explicit recipients; otherwise every member holding `permission` (default: all members). */
  userIds?: string[];
  permission?: Permission;
};

export async function notify(input: NotifyInput): Promise<number> {
  const members = await db.workspaceMember.findMany({
    where: { workspaceId: input.workspaceId, ...(input.userIds ? { userId: { in: input.userIds } } : {}) },
    include: { user: { select: { id: true, email: true, notificationPrefs: true, deletedAt: true } }, role: { select: { permissions: true } } },
  });
  const recipients = members.filter((m) => !m.user.deletedAt && (!input.permission || hasPermission(m.role.permissions, input.permission)));

  let count = 0;
  for (const m of recipients) {
    const pref = resolvePref(m.user.notificationPrefs as NotificationPrefs, input.type);
    if (pref.inApp) {
      await db.notification.create({
        data: { workspaceId: input.workspaceId, userId: m.user.id, type: input.type, title: input.title, body: input.body, link: input.link },
      });
      count++;
    }
    if (pref.email) {
      const mail = notificationEmail(input.title, input.body ?? "", input.link);
      await enqueue("email", { kind: "send-notification", to: m.user.email, subject: input.title, ...mail });
    }
  }
  return count;
}
