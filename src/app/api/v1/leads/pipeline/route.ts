import { route } from "@/server/api";
import { pipeline } from "@/server/services/leads";

export const GET = route({ permission: "leads:read" }, async ({ ctx }) => pipeline(ctx.workspace.id));
