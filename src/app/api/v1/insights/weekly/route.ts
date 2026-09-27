import { route } from "@/server/api";
import { weeklyDigest } from "@/server/services/insights";

// Generates this week's AI digest on demand (the worker also creates it automatically each week).
export const POST = route({ permission: "analytics:read", rateLimit: { limit: 10, windowSec: 3600 } }, async ({ ctx }) => {
  const content = await weeklyDigest(ctx.workspace.id, true);
  return { id: content!.id, title: content!.title };
});
