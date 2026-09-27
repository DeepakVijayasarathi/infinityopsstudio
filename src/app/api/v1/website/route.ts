import { z } from "zod";
import { route } from "@/server/api";
import { getOrCreateWidget, updateWidget, websiteStats } from "@/server/services/website";

export const GET = route({ permission: "analytics:read", query: z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }) }, async ({ ctx, query }) => {
  const [widget, stats] = await Promise.all([getOrCreateWidget(ctx.workspace.id), websiteStats(ctx.workspace.id, query.days)]);
  const { inboundEmailToken: _t, ...publicWidget } = widget;
  return { widget: publicWidget, stats };
});

const schema = z.object({
  enabled: z.boolean().optional(),
  chatEnabled: z.boolean().optional(),
  aiReplies: z.boolean().optional(),
  greeting: z.string().trim().min(1).max(200).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #1f5cf5").optional(),
  position: z.enum(["left", "right"]).optional(),
  askEmailAfter: z.coerce.number().int().min(0).max(10).optional(),
  allowedDomains: z.array(z.string().trim().max(120)).max(20).optional(),
});

export const PUT = route({ permission: "integrations:manage", body: schema }, async ({ ctx, body }) => {
  const { inboundEmailToken: _t, ...w } = await updateWidget(ctx, body);
  return w;
});
