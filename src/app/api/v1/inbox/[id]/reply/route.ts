import { z } from "zod";
import { route } from "@/server/api";
import { reply } from "@/server/services/inbox";

const schema = z.object({ body: z.string().trim().min(1, "Write a reply").max(4000) });

export const POST = route({ permission: "leads:write", body: schema, rateLimit: { limit: 60, windowSec: 60, key: "inbox-reply" } }, async ({ ctx, params, body }) =>
  reply(ctx, params.id!, body.body),
);
