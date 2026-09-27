import { route } from "@/server/api";
import { retryTask } from "@/server/services/workers";

export const POST = route({ permission: "workers:run" }, async ({ ctx, params }) => {
  await retryTask(ctx, params.id!);
  return { ok: true };
});
