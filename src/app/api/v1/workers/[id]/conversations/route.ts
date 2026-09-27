import { route } from "@/server/api";
import { listConversations } from "@/server/services/workers";

export const GET = route({ permission: "workers:read" }, async ({ ctx, params }) => listConversations(ctx, params.id!));
