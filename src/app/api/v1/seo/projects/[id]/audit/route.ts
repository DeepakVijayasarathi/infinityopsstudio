import { z } from "zod";
import { route } from "@/server/api";
import { runAudit } from "@/server/services/seo";

export const POST = route({ permission: "seo:write", body: z.object({ path: z.string().max(300).optional() }), rateLimit: { limit: 20, windowSec: 3600 } }, async ({ ctx, params, body }) => runAudit(ctx, params.id!, body.path));
