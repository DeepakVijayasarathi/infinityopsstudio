import { route } from "@/server/api";
import { cancelTask } from "@/server/services/workers";

export const POST = route({ permission: "workers:run" }, async ({ ctx, params }) => {
  await cancelTask(ctx, params.id!);
  return { ok: true };
});
