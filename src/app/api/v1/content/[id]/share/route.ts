import { z } from "zod";
import { route } from "@/server/api";
import { env } from "@/server/env";
import { setSharing } from "@/server/services/content";

export const POST = route({ permission: "content:write", body: z.object({ enabled: z.boolean() }) }, async ({ ctx, params, body }) => {
  const { shareToken } = await setSharing(ctx, params.id!, body.enabled);
  return { shareToken, url: shareToken ? `${env().APP_URL}/share/${shareToken}` : null };
});
