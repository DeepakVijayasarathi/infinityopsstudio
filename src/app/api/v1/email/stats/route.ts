import { route } from "@/server/api";
import { emailStats } from "@/server/services/email";

export const GET = route({ permission: "email:read" }, async ({ ctx }) => emailStats(ctx.workspace.id));
