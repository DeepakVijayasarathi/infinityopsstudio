import { z } from "zod";
import { route } from "@/server/api";
import { trackEvent } from "@/server/services/website";

const schema = z.object({
  type: z.enum(["pageview", "conversion"]).default("pageview"),
  url: z.string().url().max(2000),
  referrer: z.string().max(2000).optional().nullable(),
  utmSource: z.string().max(100).optional().nullable(),
  utmCampaign: z.string().max(100).optional().nullable(),
  landingPageId: z.string().max(40).optional().nullable(),
});

// Public (CORS *): page views and conversions from the website script.
export const POST = route({ auth: "public", body: schema, rateLimit: { limit: 120, windowSec: 60, key: "pub-track" } }, async ({ req, params, body, meta }) =>
  trackEvent(params.key!, body, { ip: meta.ip ?? "unknown", userAgent: meta.userAgent ?? null, origin: req.headers.get("origin") }),
);
