import { route } from "@/server/api";
import { changePlanSchema } from "@/lib/schemas";
import { changePlan } from "@/server/billing/service";

export const POST = route({ permission: "billing:manage", body: changePlanSchema, rateLimit: { limit: 20, windowSec: 3600 } }, async ({ ctx, body }) => changePlan(ctx, body.plan, body.interval));
