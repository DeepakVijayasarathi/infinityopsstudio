import { z } from "zod";
import { route } from "@/server/api";
import { regenerateSection } from "@/server/services/landing-pages";

const schema = z.object({ section: z.enum(["hero", "benefits", "steps", "proof", "faq", "form", "closing"]) });

export const POST = route({ permission: "content:write", body: schema, rateLimit: { limit: 30, windowSec: 600, key: "pages-regen" } }, async ({ ctx, params, body }) => regenerateSection(ctx, params.id!, body.section));
