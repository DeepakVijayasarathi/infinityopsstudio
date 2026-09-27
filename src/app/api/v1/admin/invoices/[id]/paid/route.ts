import { route } from "@/server/api";
import { markInvoicePaid } from "@/server/services/admin";

export const POST = route({ auth: "admin" }, async ({ user, params }) => {
  await markInvoicePaid(user.id, params.id!);
  return { ok: true };
});
