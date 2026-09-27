import { route } from "@/server/api";
import { changePlanSchema } from "@/lib/schemas";
import { adminSetPlan } from "@/server/services/admin";

export const POST = route({ auth: "admin", body: changePlanSchema }, async ({ user, params, body }) => {
  await adminSetPlan(user.id, params.id!, body.plan);
  return { ok: true };
});
