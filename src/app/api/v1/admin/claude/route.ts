import { z } from "zod";
import { route } from "@/server/api";
import { claudeStatus, connectClaude, disconnectClaude } from "@/server/services/claude-connection";

export const GET = route({ auth: "admin" }, async () => claudeStatus());

// Connect a Claude Pro/Max plan with a `claude setup-token` token (tested before it's saved).
export const POST = route({ auth: "admin", body: z.object({ token: z.string().min(20).max(500) }), rateLimit: { limit: 10, windowSec: 600, key: "admin-claude" } }, async ({ user, body }) =>
  connectClaude(user.id, body.token),
);

export const DELETE = route({ auth: "admin" }, async ({ user }) => disconnectClaude(user.id));
