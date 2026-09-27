import { z } from "zod";
import { route } from "@/server/api";
import { NOTIFICATION_TYPES, type NotificationPrefs } from "@/server/services/notifications";
import { updateNotificationPrefs } from "@/server/services/users";

const prefSchema = z.record(z.enum(Object.keys(NOTIFICATION_TYPES) as [string, ...string[]]), z.object({ inApp: z.boolean(), email: z.boolean() }));

export const PUT = route({ auth: "user", body: prefSchema }, async ({ user, body }) => {
  await updateNotificationPrefs(user.id, body as NotificationPrefs);
  return { ok: true };
});
