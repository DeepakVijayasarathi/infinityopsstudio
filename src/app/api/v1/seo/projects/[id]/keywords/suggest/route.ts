import { z } from "zod";
import { route } from "@/server/api";
import { suggestKeywords } from "@/server/services/seo";

export const POST = route({ permission: "seo:write", body: z.object({ seed: z.string().trim().min(2).max(200) }), rateLimit: { limit: 60, windowSec: 3600 } }, async ({ ctx, params, body }) => suggestKeywords(ctx, params.id!, body.seed));
