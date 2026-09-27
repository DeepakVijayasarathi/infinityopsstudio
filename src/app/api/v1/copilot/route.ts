import { z } from "zod";
import { route } from "@/server/api";
import { copilotPlan } from "@/server/services/copilot";

const schema = z.object({
  message: z.string().trim().min(1, "Type a message").max(2000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) })).max(20).default([]),
});

export const POST = route({ body: schema, rateLimit: { limit: 120, windowSec: 3600, key: "copilot" } }, async ({ ctx, body }) => copilotPlan(ctx!, body.message, body.history));
