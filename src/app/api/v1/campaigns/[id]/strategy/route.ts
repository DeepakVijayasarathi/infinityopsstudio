import { z } from "zod";
import { route } from "@/server/api";
import { sseResponse } from "@/server/ai/service";
import { generateStrategy } from "@/server/services/campaigns";

export const POST = route({ permission: "campaigns:write", body: z.object({ instructions: z.string().max(2000).optional() }), rateLimit: { limit: 30, windowSec: 3600 } }, async ({ ctx, params, body }) =>
  sseResponse(await generateStrategy(ctx, params.id!, body.instructions)),
);
