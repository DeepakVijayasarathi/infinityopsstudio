import { route } from "@/server/api";
import { adminDashboard } from "@/server/services/admin";

export const GET = route({ auth: "admin" }, async () => adminDashboard());
