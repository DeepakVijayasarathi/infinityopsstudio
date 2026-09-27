import { route } from "@/server/api";
import { testIntegration } from "@/server/services/integrations";

export const POST = route({ permission: "integrations:manage", rateLimit: { limit: 30, windowSec: 3600 } }, async ({ ctx, params }) => testIntegration(ctx, params.key!));
