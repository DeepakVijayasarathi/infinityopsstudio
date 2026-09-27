import { z } from "zod";
import { route } from "@/server/api";
import { calendar } from "@/server/services/social";

const q = z.object({ from: z.coerce.date(), to: z.coerce.date() }).refine((v) => v.to.getTime() - v.from.getTime() <= 100 * 86400_000, "Range too large");
export const GET = route({ permission: "social:read", query: q }, async ({ ctx, query }) => calendar(ctx.workspace.id, query.from, query.to));
