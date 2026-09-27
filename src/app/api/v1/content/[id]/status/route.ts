import { route } from "@/server/api";
import { contentStatusSchema } from "@/lib/schemas";
import { changeContentStatus } from "@/server/services/content";

export const POST = route({ permission: "content:write", body: contentStatusSchema }, async ({ ctx, params, body }) => changeContentStatus(ctx, params.id!, body.status));
