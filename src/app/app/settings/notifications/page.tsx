import type { Metadata } from "next";
import { requireContext } from "@/server/page-context";
import { db } from "@/server/db";
import { NOTIFICATION_TYPES, resolvePref, type NotificationPrefs, type NotificationType } from "@/server/services/notifications";
import { NotificationPrefsForm } from "./prefs-form";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const ctx = await requireContext();
  const user = await db.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { notificationPrefs: true } });
  const prefs = user.notificationPrefs as NotificationPrefs | null;
  const rows = (Object.keys(NOTIFICATION_TYPES) as NotificationType[]).map((t) => ({ type: t, label: NOTIFICATION_TYPES[t].label, ...resolvePref(prefs, t) }));
  return <NotificationPrefsForm rows={rows} />;
}
