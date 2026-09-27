import { route } from "@/server/api";
import { generateSchema } from "@/lib/schemas";
import { sseResponse } from "@/server/ai/service";
import { generateContentStream } from "@/server/services/content";

export const POST = route({ permission: "content:write", body: generateSchema, rateLimit: { limit: 120, windowSec: 3600 } }, async ({ ctx, body }) => {
  const { stream } = await generateContentStream(ctx, body);
  return sseResponse(stream);
});
