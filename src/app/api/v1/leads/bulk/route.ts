import { route } from "@/server/api";
import { assertCan } from "@/server/tenant";
import { leadBulkSchema } from "@/lib/schemas";
import { bulkUpdate, deleteLeads } from "@/server/services/leads";

export const POST = route({ permission: "leads:write", body: leadBulkSchema }, async ({ ctx, body }) => {
  if (body.action === "delete") {
    assertCan(ctx, "leads:delete");
    return deleteLeads(ctx, body.ids);
  }
  return bulkUpdate(ctx, body.ids, { status: body.status, addTag: body.addTag, ownerId: body.ownerId });
});
