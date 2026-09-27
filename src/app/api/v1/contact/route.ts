import { route } from "@/server/api";
import { contactSchema } from "@/lib/schemas";
import { submitContact } from "@/server/services/public";

export const POST = route({ auth: "public", body: contactSchema, rateLimit: { limit: 5, windowSec: 3600, key: "contact" } }, async ({ body, meta }) => {
  const { website: _honeypot, ...data } = body;
  return submitContact(data, meta.ip);
});
