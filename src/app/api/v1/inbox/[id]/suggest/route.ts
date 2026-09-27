import { route } from "@/server/api";
import { suggestReply } from "@/server/services/inbox";

export const POST = route({ permission: "leads:write", rateLimit: { limit: 30, windowSec: 60, key: "inbox-suggest" } }, async ({ ctx, params }) => suggestReply(ctx, params.id!));
