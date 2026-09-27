import { z } from "zod";
import { route } from "@/server/api";
import { connectIntegration, disconnectIntegration } from "@/server/services/integrations";

export const POST = route({ permission: "integrations:manage", body: z.object({ values: z.record(z.string().max(20_000)) }), rateLimit: { limit: 30, windowSec: 3600 } }, async ({ ctx, params, body }) => connectIntegration(ctx, params.key!, body.values));
export const DELETE = route({ permission: "integrations:manage" }, async ({ ctx, params }) => {
  await disconnectIntegration(ctx, params.key!);
  return { ok: true };
});
