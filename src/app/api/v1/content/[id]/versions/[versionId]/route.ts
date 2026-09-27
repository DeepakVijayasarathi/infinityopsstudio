import { route } from "@/server/api";
import { getVersion } from "@/server/services/content";

export const GET = route({ permission: "content:read" }, async ({ ctx, params }) => getVersion(ctx.workspace.id, params.id!, params.versionId!));
