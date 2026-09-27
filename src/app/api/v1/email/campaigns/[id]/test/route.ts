import { route } from "@/server/api";
import { sendTestEmail } from "@/server/services/email";

export const POST = route({ permission: "email:write", rateLimit: { limit: 20, windowSec: 3600 } }, async ({ ctx, params }) => sendTestEmail(ctx, params.id!));
