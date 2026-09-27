import { z } from "zod";
import { route } from "@/server/api";
import { badRequest } from "@/server/errors";
import { listFiles, uploadFile } from "@/server/services/files";

export const GET = route({}, async ({ ctx }) => listFiles(ctx.workspace.id));
export const POST = route({ permission: "content:write", rateLimit: { limit: 100, windowSec: 3600 } }, async ({ ctx, req }) => {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw badRequest("Attach a file");
  const opts = z.object({ purpose: z.string().max(40).optional(), visibility: z.enum(["PRIVATE", "PUBLIC"]).optional() }).parse({
    purpose: form?.get("purpose") ?? undefined,
    visibility: form?.get("visibility") ?? undefined,
  });
  return uploadFile(ctx, file, opts);
});
