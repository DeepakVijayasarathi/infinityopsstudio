import { route } from "@/server/api";
import { recentActivity } from "@/server/services/activity";

export const GET = route({}, async ({ ctx }) => recentActivity(ctx.workspace.id, 20));
