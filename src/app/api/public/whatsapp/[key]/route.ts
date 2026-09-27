import { route } from "@/server/api";
import { whatsappInbound, whatsappVerify } from "@/server/services/inbox";

// Meta webhook verification: echo hub.challenge as plain text.
export const GET = route({ auth: "public", rateLimit: { limit: 30, windowSec: 60, key: "pub-wa-verify" } }, async ({ req, params }) => {
  const q = req.nextUrl.searchParams;
  const challenge = await whatsappVerify(params.key!, q.get("hub.mode"), q.get("hub.verify_token"), q.get("hub.challenge"));
  return new Response(challenge, { headers: { "content-type": "text/plain" } });
});

// Signed message deliveries. The raw body is needed for the HMAC check, so it isn't parsed by route().
export const POST = route({ auth: "public", rateLimit: { limit: 600, windowSec: 60, key: "pub-wa" } }, async ({ req, params }) => {
  const raw = await req.text();
  if (raw.length > 1_000_000) return new Response("Too large", { status: 413 });
  return whatsappInbound(params.key!, raw, req.headers.get("x-hub-signature-256"));
});
