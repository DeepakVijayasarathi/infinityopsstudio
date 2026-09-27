import { z } from "zod";
import { route } from "@/server/api";
import { setUserRole, setUserStatus } from "@/server/services/admin";

export const PATCH = route({ auth: "admin", body: z.object({ status: z.enum(["ACTIVE", "SUSPENDED"]).optional(), platformRole: z.enum(["USER", "SUPER_ADMIN"]).optional() }) }, async ({ user, params, body }) => {
  if (body.status) await setUserStatus(user.id, params.id!, body.status);
  if (body.platformRole) await setUserRole(user.id, params.id!, body.platformRole);
  return { ok: true };
});
