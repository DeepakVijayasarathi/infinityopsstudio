import { route } from "@/server/api";
import { adminContentOverview } from "@/server/services/admin";

export const GET = route({ auth: "admin" }, async () => adminContentOverview());
