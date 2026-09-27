import { route } from "@/server/api";
import { segmentPreviewSchema } from "@/lib/schemas";
import { previewSegment } from "@/server/services/email";

export const POST = route({ permission: "email:read", body: segmentPreviewSchema }, async ({ ctx, body }) => previewSegment(ctx.workspace.id, body));
