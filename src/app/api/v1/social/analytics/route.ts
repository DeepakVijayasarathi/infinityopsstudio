import { z } from "zod";
import { route } from "@/server/api";
import { socialAnalytics } from "@/server/services/social";

export const GET = route({ permission: "social:read", query: z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }) }, async ({ ctx, query }) => socialAnalytics(ctx.workspace.id, query.days));
