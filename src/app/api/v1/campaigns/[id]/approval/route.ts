import { z } from "zod";
import { route } from "@/server/api";
import { assertCan } from "@/server/tenant";
import { reviewCampaign, submitForApproval } from "@/server/services/campaigns";

const body = z.object({ action: z.enum(["submit", "approve", "changes"]), note: z.string().max(1000).optional() });
export const POST = route({ permission: "campaigns:write", body }, async ({ ctx, params, body }) => {
  if (body.action === "submit") await submitForApproval(ctx, params.id!);
  else {
    assertCan(ctx, "campaigns:approve");
    await reviewCampaign(ctx, params.id!, body.action === "approve" ? "approve" : "changes", body.note);
  }
  return { ok: true };
});
