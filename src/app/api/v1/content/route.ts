import { z } from "zod";
import { route } from "@/server/api";
import { paginationSchema } from "@/server/pagination";
import { contentCreateSchema } from "@/lib/schemas";
import { CONTENT_STATUSES, CONTENT_TYPES } from "@/lib/constants";
import { createContent, listContent } from "@/server/services/content";

const q = paginationSchema.extend({ type: z.enum(CONTENT_TYPES).optional(), status: z.enum(CONTENT_STATUSES).optional(), campaignId: z.string().optional() });
export const GET = route({ permission: "content:read", query: q }, async ({ ctx, query }) => listContent(ctx.workspace.id, query));
export const POST = route({ permission: "content:write", body: contentCreateSchema }, async ({ ctx, body }) => createContent(ctx, body));
