import { z } from "zod";
import { route } from "@/server/api";
import { runManually } from "@/server/services/automations";

export const POST = route({ permission: "automations:write", body: z.object({ payload: z.record(z.unknown()).optional() }), rateLimit: { limit: 60, windowSec: 3600 } }, async ({ ctx, params, body }) => {
  const exec = await runManually(ctx, params.id!, body.payload);
  return { executionId: exec.id };
});
