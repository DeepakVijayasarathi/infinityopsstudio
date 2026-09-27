import { route } from "@/server/api";
import { runAgent } from "@/server/services/agent";

export const POST = route({ permission: "campaigns:write", rateLimit: { limit: 6, windowSec: 600, key: "agent-run" } }, async ({ ctx }) => runAgent(ctx.workspace.id, "manual", ctx));
