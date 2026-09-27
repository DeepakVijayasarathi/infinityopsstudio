import { route } from "@/server/api";
import { restoreVersion } from "@/server/services/content";

export const POST = route({ permission: "content:write" }, async ({ ctx, params }) => restoreVersion(ctx, params.id!, params.versionId!));
