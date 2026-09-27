import { route } from "@/server/api";
import { chatSchema } from "@/lib/schemas";
import { sseResponse } from "@/server/ai/service";
import { chatWithWorker } from "@/server/services/workers";

export const POST = route({ permission: "workers:run", body: chatSchema, rateLimit: { limit: 60, windowSec: 3600 } }, async ({ ctx, params, body }) => {
  const { stream, conversationId } = await chatWithWorker(ctx, params.id!, body.message, body.conversationId);
  const res = sseResponse(stream);
  res.headers.set("x-conversation-id", conversationId);
  return res;
});
