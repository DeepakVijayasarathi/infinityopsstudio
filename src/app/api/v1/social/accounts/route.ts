import { route } from "@/server/api";
import { socialAccountSchema } from "@/lib/schemas";
import { connectAccount, listAccounts } from "@/server/services/social";

export const GET = route({ permission: "social:read" }, async ({ ctx }) => listAccounts(ctx.workspace.id));
export const POST = route({ permission: "integrations:manage", body: socialAccountSchema }, async ({ ctx, body }) => connectAccount(ctx, body));
