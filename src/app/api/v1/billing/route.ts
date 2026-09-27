import { route } from "@/server/api";
import { billingOverview } from "@/server/billing/service";

export const GET = route({ permission: "billing:view" }, async ({ ctx }) => billingOverview(ctx.workspace.id));
