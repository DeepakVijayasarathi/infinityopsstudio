import { route } from "@/server/api";
import { flagSchema } from "@/lib/schemas";
import { listFlags, upsertFlag } from "@/server/services/admin";

export const GET = route({ auth: "admin" }, async () => listFlags());
export const POST = route({ auth: "admin", body: flagSchema }, async ({ user, body }) => upsertFlag(user.id, body));
