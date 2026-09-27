import { route } from "@/server/api";
import { cancelPendingChange } from "@/server/billing/service";

export const POST = route({ permission: "billing:manage" }, async ({ ctx }) => {
  await cancelPendingChange(ctx);
  return { ok: true };
});
