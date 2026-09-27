import { z } from "zod";
import { route } from "@/server/api";
import { decide } from "@/server/services/agent";

// Approving runs the action as the current member; its own permission is re-checked there.
export const POST = route({ permission: "content:write", body: z.object({ decision: z.enum(["approve", "dismiss"]) }), rateLimit: { limit: 30, windowSec: 60, key: "agent-decide" } }, async ({ ctx, params, body }) =>
  decide(ctx, params.id!, body.decision),
);
