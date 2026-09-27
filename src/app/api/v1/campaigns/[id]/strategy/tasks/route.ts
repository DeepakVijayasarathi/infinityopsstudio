import { route } from "@/server/api";
import { tasksFromStrategy } from "@/server/services/campaigns";

export const POST = route({ permission: "campaigns:write" }, async ({ ctx, params }) => tasksFromStrategy(ctx, params.id!));
