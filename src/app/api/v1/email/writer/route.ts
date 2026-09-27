import { route } from "@/server/api";
import { emailWriterSchema } from "@/lib/schemas";
import { sseResponse } from "@/server/ai/service";
import { emailWriterStream } from "@/server/services/email";

export const POST = route({ permission: "email:write", body: emailWriterSchema, rateLimit: { limit: 120, windowSec: 3600 } }, async ({ ctx, body }) => sseResponse(await emailWriterStream(ctx, body)));
