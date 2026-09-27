import { z } from "zod";
import { route } from "@/server/api";
import { captureLead } from "@/server/services/website";

const schema = z.object({
  name: z.string().trim().max(120).optional().nullable(),
  email: z.string().trim().email("Enter a valid email address").max(200),
  phone: z.string().trim().max(40).optional().nullable(),
  company: z.string().trim().max(120).optional().nullable(),
  message: z.string().trim().max(3000).optional().nullable(),
  page: z.string().max(500).optional().nullable(),
  landingPageId: z.string().max(40).optional().nullable(),
  utmSource: z.string().max(100).optional().nullable(),
  utmCampaign: z.string().max(100).optional().nullable(),
  // Honeypot: real visitors never fill this hidden field.
  website: z.string().max(0, "Spam detected").optional(),
});

// Public (CORS *): website and landing-page forms → leads.
export const POST = route({ auth: "public", body: schema, rateLimit: { limit: 10, windowSec: 600, key: "pub-lead" } }, async ({ req, params, body, meta }) =>
  captureLead(params.key!, body, { ip: meta.ip ?? "unknown", userAgent: meta.userAgent ?? null, origin: req.headers.get("origin") }),
);
