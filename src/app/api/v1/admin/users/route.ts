import { route } from "@/server/api";
import { paginationSchema } from "@/server/pagination";
import { adminUsers } from "@/server/services/admin";

export const GET = route({ auth: "admin", query: paginationSchema }, async ({ query }) => adminUsers(query));
