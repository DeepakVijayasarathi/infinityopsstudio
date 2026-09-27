import { route } from "@/server/api";
import { contentOpportunities } from "@/server/services/seo";

export const GET = route({ permission: "seo:read" }, async ({ ctx }) => contentOpportunities(ctx.workspace.id));
