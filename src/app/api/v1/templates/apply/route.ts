import { z } from "zod";
import { route } from "@/server/api";
import { applyTemplate } from "@/server/services/templates";

const schema = z.object({ kind: z.enum(["campaign", "email", "automation"]), key: z.string().min(1).max(60) });

// Permission depends on the template kind and is checked in the service.
export const POST = route({ body: schema, rateLimit: { limit: 60, windowSec: 3600 } }, async ({ ctx, body }) => applyTemplate(ctx!, body.kind, body.key));
