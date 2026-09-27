import { route } from "@/server/api";
import { beginTwoFactorSetup } from "@/server/services/auth";

export const POST = route({ auth: "user" }, async ({ user }) => beginTwoFactorSetup(user.id));
