import { route } from "@/server/api";
import { internalLinkSuggestions } from "@/server/services/seo";

export const GET = route({ permission: "content:read" }, async ({ ctx, params }) => internalLinkSuggestions(ctx.workspace.id, params.id!));
