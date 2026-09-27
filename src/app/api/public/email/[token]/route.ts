import { route } from "@/server/api";
import { badRequest } from "@/server/errors";
import { emailInbound } from "@/server/services/inbox";

// Inbound email webhook (Postmark, SendGrid Inbound Parse, Mailgun routes or plain JSON).
// The unguessable token in the URL is the credential.
export const POST = route({ auth: "public", rateLimit: { limit: 300, windowSec: 60, key: "pub-email" } }, async ({ req, params }) => {
  const type = req.headers.get("content-type") ?? "";
  let fields: Record<string, unknown>;
  if (type.includes("application/json")) {
    const text = await req.text();
    if (text.length > 2_000_000) throw badRequest("Message too large");
    fields = JSON.parse(text) as Record<string, unknown>;
  } else if (type.includes("form")) {
    const form = await req.formData();
    fields = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));
  } else {
    throw badRequest("Send JSON or form data");
  }
  return emailInbound(params.token!, fields);
});
