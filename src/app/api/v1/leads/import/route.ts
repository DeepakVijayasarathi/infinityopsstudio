import { route } from "@/server/api";
import { badRequest } from "@/server/errors";
import { env } from "@/server/env";
import { importLeads } from "@/server/services/leads";

export const POST = route({ permission: "leads:write", rateLimit: { limit: 20, windowSec: 3600 } }, async ({ ctx, req }) => {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw badRequest("Attach a CSV file");
  if (file.size > env().MAX_UPLOAD_BYTES) throw badRequest("CSV file is too large");
  if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") throw badRequest("Upload a .csv file");
  return importLeads(ctx, await file.text());
});
