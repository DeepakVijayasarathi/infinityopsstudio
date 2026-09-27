import { route } from "@/server/api";
import { saveTaskAsContent } from "@/server/services/workers";

export const POST = route({ permission: "content:write" }, async ({ ctx, params }) => {
  const c = await saveTaskAsContent(ctx, params.id!);
  return { id: c.id };
});
