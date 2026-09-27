import { z } from "zod";
import { route } from "@/server/api";
import { setWorkflowEnabled } from "@/server/services/automations";

export const POST = route({ permission: "automations:write", body: z.object({ enabled: z.boolean() }) }, async ({ ctx, params, body }) => {
  await setWorkflowEnabled(ctx, params.id!, body.enabled);
  return { enabled: body.enabled };
});
