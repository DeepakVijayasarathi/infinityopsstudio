import { route } from "@/server/api";
import { resubscribeLead } from "@/server/services/email";

export const POST = route({ permission: "email:send" }, async ({ ctx, params }) => {
  await resubscribeLead(ctx, params.id!);
  return { ok: true };
});
