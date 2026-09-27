import { z } from "zod";
import { route } from "@/server/api";
import { globalSearch } from "@/server/services/search";

export const GET = route({ query: z.object({ q: z.string().trim().max(100).default("") }), rateLimit: { limit: 600, windowSec: 3600 } }, async ({ ctx, query }) => globalSearch(ctx.workspace.id, query.q));
