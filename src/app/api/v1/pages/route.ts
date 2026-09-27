import { z } from "zod";
import { route } from "@/server/api";
import { createPage, listPages } from "@/server/services/landing-pages";

export const GET = route({ permission: "content:read" }, async ({ ctx }) => listPages(ctx.workspace.id));

const schema = z.object({
  offer: z.string().trim().min(3, "Describe what the page offers").max(500),
  audience: z.string().trim().max(300).optional().nullable(),
  goal: z.string().trim().max(300).optional().nullable(),
  campaignId: z.string().max(40).optional().nullable(),
});

export const POST = route({ permission: "content:write", body: schema, rateLimit: { limit: 20, windowSec: 600, key: "pages-create" } }, async ({ ctx, body }) => createPage(ctx, body));
