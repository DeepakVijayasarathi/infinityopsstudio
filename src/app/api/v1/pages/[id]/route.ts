import { z } from "zod";
import { route } from "@/server/api";
import { deletePage, getPage, pageContentSchema, updatePage } from "@/server/services/landing-pages";

export const GET = route({ permission: "content:read" }, async ({ ctx, params }) => getPage(ctx.workspace.id, params.id!));

const schema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  slug: z.string().trim().min(1).max(60).optional(),
  content: pageContentSchema.optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #1f5cf5").optional(),
  seoTitle: z.string().trim().max(70).optional().nullable(),
  seoDescription: z.string().trim().max(160).optional().nullable(),
  campaignId: z.string().max(40).optional().nullable(),
});

export const PATCH = route({ permission: "content:write", body: schema }, async ({ ctx, params, body }) => updatePage(ctx, params.id!, body));

export const DELETE = route({ permission: "content:write" }, async ({ ctx, params }) => deletePage(ctx, params.id!));
