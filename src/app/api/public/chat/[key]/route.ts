import { z } from "zod";
import { route } from "@/server/api";
import { chat, chatMessages } from "@/server/services/website";

const visitorId = z.string().regex(/^[a-zA-Z0-9_-]{8,64}$/, "Invalid visitor id");

// Public (CORS *): website chat. Visitors are identified by a random id kept in their browser.
export const POST = route(
  {
    auth: "public",
    rateLimit: { limit: 30, windowSec: 60, key: "pub-chat" },
    body: z.object({ visitorId, message: z.string().trim().min(1).max(2000), name: z.string().trim().max(100).optional().nullable(), email: z.string().trim().email().max(200).optional().nullable().or(z.literal("")), page: z.string().max(500).optional().nullable() }),
  },
  async ({ req, params, body, meta }) => chat(params.key!, body, { ip: meta.ip ?? "unknown", userAgent: meta.userAgent ?? null, origin: req.headers.get("origin") }),
);

export const GET = route(
  { auth: "public", rateLimit: { limit: 120, windowSec: 60, key: "pub-chat-poll" }, query: z.object({ visitorId, after: z.string().max(40).optional() }) },
  async ({ req, params, query }) => chatMessages(params.key!, query.visitorId, req.headers.get("origin"), query.after),
);
