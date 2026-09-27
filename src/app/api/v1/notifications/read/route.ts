import { z } from "zod";
import { route } from "@/server/api";
import { db } from "@/server/db";

export const POST = route({ auth: "user", body: z.object({ ids: z.array(z.string()).max(200).optional(), all: z.boolean().optional() }) }, async ({ user, body }) => {
  const res = await db.notification.updateMany({
    where: { userId: user.id, readAt: null, ...(body.all ? {} : { id: { in: body.ids ?? [] } }) },
    data: { readAt: new Date() },
  });
  return { updated: res.count };
});
