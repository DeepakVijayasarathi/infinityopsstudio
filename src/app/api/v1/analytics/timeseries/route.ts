import { z } from "zod";
import { route } from "@/server/api";
import { resolveRange, timeseries } from "@/server/services/analytics";

const range = z.object({ days: z.coerce.number().int().min(1).max(730).optional(), from: z.string().optional(), to: z.string().optional() });
const q = range.extend({ channel: z.enum(["WEBSITE", "SOCIAL", "EMAIL", "ADS", "SEO"]).optional(), campaignId: z.string().optional() });
export const GET = route({ permission: "analytics:read", query: q }, async ({ ctx, query }) => timeseries(ctx.workspace.id, resolveRange(query), query.channel, query.campaignId));
