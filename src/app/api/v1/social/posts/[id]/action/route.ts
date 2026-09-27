import { route } from "@/server/api";
import { badRequest } from "@/server/errors";
import { assertCan } from "@/server/tenant";
import { socialActionSchema } from "@/lib/schemas";
import { markPublished, publishNow, reviewPost, schedulePost } from "@/server/services/social";

export const POST = route({ permission: "social:write", body: socialActionSchema }, async ({ ctx, params, body }) => {
  const id = params.id!;
  switch (body.action) {
    case "approve":
    case "reject":
      assertCan(ctx, "social:publish");
      return reviewPost(ctx, id, body.action);
    case "schedule":
      if (!body.scheduledAt) throw badRequest("Choose a date and time");
      return schedulePost(ctx, id, body.scheduledAt);
    case "publish":
      await publishNow(ctx, id);
      return { ok: true };
    case "mark-published":
      assertCan(ctx, "social:publish");
      return markPublished(ctx, id, body.externalUrl);
  }
});
