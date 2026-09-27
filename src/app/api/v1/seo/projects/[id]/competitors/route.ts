import { route } from "@/server/api";
import { sseResponse } from "@/server/ai/service";
import { competitorResearchStream } from "@/server/services/seo";

export const POST = route({ permission: "seo:write", rateLimit: { limit: 20, windowSec: 3600 } }, async ({ ctx, params }) => sseResponse(await competitorResearchStream(ctx, params.id!)));
