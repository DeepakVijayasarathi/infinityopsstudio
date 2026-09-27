import { z } from "zod";
import { route } from "@/server/api";
import { actionSchema, copilotExecute } from "@/server/services/copilot";

// Permissions are checked per action inside copilotExecute.
export const POST = route({ body: z.object({ action: actionSchema }), rateLimit: { limit: 60, windowSec: 3600, key: "copilot-exec" } }, async ({ ctx, body }) => copilotExecute(ctx!, body.action));
