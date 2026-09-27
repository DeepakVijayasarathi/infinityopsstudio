import { z } from "zod";
import { route } from "@/server/api";
import { db } from "@/server/db";

export const GET = route({ auth: "user", query: z.object({ unread: z.coerce.boolean().optional(), limit: z.coerce.number().int().min(1).max(100).default(30) }) }, async ({ user, query }) => {
  const where = { userId: user.id, ...(query.unread ? { readAt: null } : {}) };
  const [items, unreadCount] = await Promise.all([
    db.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: query.limit }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  return { items, unreadCount };
});
