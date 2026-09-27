import { route } from "@/server/api";
import { captionSchema } from "@/lib/schemas";
import { sseResponse } from "@/server/ai/service";
import { captionStream } from "@/server/services/social";

export const POST = route({ permission: "social:write", body: captionSchema, rateLimit: { limit: 120, windowSec: 3600 } }, async ({ ctx, body }) => sseResponse(await captionStream(ctx, body)));
