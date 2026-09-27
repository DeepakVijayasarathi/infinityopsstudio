import { z } from "zod";
import { route } from "@/server/api";
import { emailAnalytics, resolveRange } from "@/server/services/analytics";

const range = z.object({ days: z.coerce.number().int().min(1).max(730).optional(), from: z.string().optional(), to: z.string().optional() });
export const GET = route({ permission: "analytics:read", query: range }, async ({ ctx, query }) => emailAnalytics(ctx.workspace.id, resolveRange(query)));
