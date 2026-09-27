import { route } from "@/server/api";
import { inviteSchema } from "@/lib/schemas";
import { inviteMember, listMembers } from "@/server/services/workspaces";

export const GET = route({}, async ({ ctx }) => listMembers(ctx.workspace.id));
export const POST = route({ permission: "members:manage", body: inviteSchema, rateLimit: { limit: 30, windowSec: 3600 } }, async ({ ctx, body }) => inviteMember(ctx, body));
