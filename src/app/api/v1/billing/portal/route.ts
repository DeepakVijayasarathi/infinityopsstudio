import { route } from "@/server/api";
import { badRequest } from "@/server/errors";
import { portalUrl } from "@/server/billing/service";

export const POST = route({ permission: "billing:manage" }, async ({ ctx }) => {
  const url = await portalUrl(ctx);
  if (!url) throw badRequest("A billing portal is not available for your billing provider");
  return { url };
});
