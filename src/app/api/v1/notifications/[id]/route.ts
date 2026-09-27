import { route } from "@/server/api";
import { db } from "@/server/db";

export const DELETE = route({ auth: "user" }, async ({ user, params }) => {
  await db.notification.deleteMany({ where: { id: params.id, userId: user.id } });
  return { ok: true };
});
