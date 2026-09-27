import { route } from "@/server/api";
import { badRequest } from "@/server/errors";
import { triggerWebhook } from "@/server/services/automations";

// Public inbound webhook: the unguessable token authenticates the caller.
export const POST = route({ auth: "public", rateLimit: { limit: 120, windowSec: 60, key: "workflow-hook" } }, async ({ req, params }) => {
  const text = await req.text();
  if (text.length > 256_000) throw badRequest("Payload too large");
  let payload: Record<string, unknown> = {};
  if (text) {
    try {
      const parsed = JSON.parse(text);
      payload = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : { data: parsed };
    } catch {
      throw badRequest("Body must be JSON");
    }
  }
  return triggerWebhook(params.token!, payload);
});
