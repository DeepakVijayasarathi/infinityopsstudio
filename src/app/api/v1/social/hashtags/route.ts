import { route } from "@/server/api";
import { hashtagSchema } from "@/lib/schemas";
import { suggestHashtags } from "@/server/services/social";

export const POST = route({ permission: "social:write", body: hashtagSchema, rateLimit: { limit: 120, windowSec: 3600 } }, async ({ ctx, body }) => ({ hashtags: await suggestHashtags(ctx, body) }));
