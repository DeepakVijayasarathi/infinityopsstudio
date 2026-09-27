import { z } from "zod";
import { route } from "@/server/api";
import { setPublished } from "@/server/services/landing-pages";

export const POST = route({ permission: "content:approve", body: z.object({ publish: z.boolean() }) }, async ({ ctx, params, body }) => setPublished(ctx, params.id!, body.publish));
