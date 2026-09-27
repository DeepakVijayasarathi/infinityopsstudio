import { z } from "zod";
import { route } from "@/server/api";
import { autofillBrandFromWebsite } from "@/server/services/brand-autofill";

export const POST = route(
  { permission: "brand:manage", body: z.object({ url: z.string().trim().min(3).max(500) }), rateLimit: { limit: 20, windowSec: 3600 } },
  async ({ ctx, body }) => autofillBrandFromWebsite(ctx.workspace.id, body.url),
);
