import { route } from "@/server/api";
import { inlineActionSchema } from "@/lib/schemas";
import { sseResponse } from "@/server/ai/service";
import { inlineActionStream } from "@/server/services/content";

export const POST = route({ permission: "content:write", body: inlineActionSchema, rateLimit: { limit: 240, windowSec: 3600 } }, async ({ ctx, body }) => sseResponse(await inlineActionStream(ctx, body)));
