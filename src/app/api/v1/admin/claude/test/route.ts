import { route } from "@/server/api";
import { testClaude } from "@/server/services/claude-connection";

export const POST = route({ auth: "admin", rateLimit: { limit: 20, windowSec: 600, key: "admin-claude-test" } }, async ({ user }) => testClaude(user.id));
