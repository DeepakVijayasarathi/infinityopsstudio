import { route } from "@/server/api";
import { linkLead } from "@/server/services/inbox";

export const POST = route({ permission: "leads:write" }, async ({ ctx, params }) => linkLead(ctx, params.id!));
