import { route } from "@/server/api";
import { campaignTaskSchema } from "@/lib/schemas";
import { addTask } from "@/server/services/campaigns";

export const POST = route({ permission: "campaigns:write", body: campaignTaskSchema }, async ({ ctx, params, body }) => addTask(ctx, params.id!, body));
