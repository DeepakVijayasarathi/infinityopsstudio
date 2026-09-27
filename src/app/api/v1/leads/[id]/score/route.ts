import { route } from "@/server/api";
import { explainLeadScore } from "@/server/services/leads";

export const GET = route({ permission: "leads:read" }, async ({ ctx, params }) => explainLeadScore(ctx.workspace.id, params.id!));
