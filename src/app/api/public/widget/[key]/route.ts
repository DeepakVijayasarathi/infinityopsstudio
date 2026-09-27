import { route } from "@/server/api";
import { widgetConfig } from "@/server/services/website";

// Public (CORS *): chat widget appearance for a website key.
export const GET = route({ auth: "public", rateLimit: { limit: 600, windowSec: 60, key: "pub-widget" } }, async ({ req, params }) => widgetConfig(params.key!, req.headers.get("origin")));
