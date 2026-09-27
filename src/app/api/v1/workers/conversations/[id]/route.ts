import { route } from "@/server/api";
import { getConversation } from "@/server/services/workers";

export const GET = route({ permission: "workers:read" }, async ({ ctx, params }) => getConversation(ctx, params.id!));
