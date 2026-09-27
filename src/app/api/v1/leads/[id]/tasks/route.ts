import { route } from "@/server/api";
import { leadTaskSchema } from "@/lib/schemas";
import { addLeadTask } from "@/server/services/leads";

export const POST = route({ permission: "leads:write", body: leadTaskSchema }, async ({ ctx, params, body }) => addLeadTask(ctx, params.id!, body));
