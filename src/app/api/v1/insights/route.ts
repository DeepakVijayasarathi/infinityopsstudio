import { route } from "@/server/api";
import { nextBestActions, workspaceInsights } from "@/server/services/insights";

export const GET = route({ permission: "analytics:read" }, async ({ ctx }) => {
  const insights = await workspaceInsights(ctx.workspace.id);
  return { insights, nextActions: nextBestActions(insights) };
});
