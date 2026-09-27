import { route } from "@/server/api";
import { adminSubscriptions } from "@/server/services/admin";

export const GET = route({ auth: "admin" }, async () => adminSubscriptions());
