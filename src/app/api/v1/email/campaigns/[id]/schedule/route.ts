import { route } from "@/server/api";
import { emailScheduleSchema } from "@/lib/schemas";
import { scheduleEmailCampaign } from "@/server/services/email";

export const POST = route({ permission: "email:write", body: emailScheduleSchema }, async ({ ctx, params, body }) => scheduleEmailCampaign(ctx, params.id!, body.scheduledAt));
