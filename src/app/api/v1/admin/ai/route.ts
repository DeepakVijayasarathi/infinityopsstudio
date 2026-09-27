import { z } from "zod";
import { route } from "@/server/api";
import { adminAiUsage } from "@/server/services/admin";

export const GET = route({ auth: "admin", query: z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }) }, async ({ query }) => adminAiUsage(query.days));
