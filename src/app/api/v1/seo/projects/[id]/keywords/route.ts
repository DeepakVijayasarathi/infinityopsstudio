import { z } from "zod";
import { route } from "@/server/api";
import { keywordsBulkSchema } from "@/lib/schemas";
import { KEYWORD_STATUSES } from "@/lib/constants";
import { addKeywords, listKeywords } from "@/server/services/seo";

export const GET = route({ permission: "seo:read", query: z.object({ status: z.enum(KEYWORD_STATUSES).optional() }) }, async ({ ctx, params, query }) => listKeywords(ctx.workspace.id, params.id!, query.status));
export const POST = route({ permission: "seo:write", body: keywordsBulkSchema }, async ({ ctx, params, body }) => addKeywords(ctx, params.id!, body.keywords));
