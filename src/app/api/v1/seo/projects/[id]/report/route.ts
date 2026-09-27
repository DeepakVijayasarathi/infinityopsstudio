import { route } from "@/server/api";
import { seoReport } from "@/server/services/seo";

export const GET = route({ permission: "seo:read" }, async ({ ctx, params }) => seoReport(ctx.workspace.id, params.id!));
