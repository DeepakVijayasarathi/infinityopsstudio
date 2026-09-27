import { route } from "@/server/api";
import { deleteFile } from "@/server/services/files";

export const DELETE = route({ permission: "content:write" }, async ({ ctx, params }) => {
  await deleteFile(ctx, params.id!);
  return { ok: true };
});
