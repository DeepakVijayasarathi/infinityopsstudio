import { route } from "@/server/api";
import { paginationSchema } from "@/server/pagination";
import { adminWorkspaces } from "@/server/services/admin";

export const GET = route({ auth: "admin", query: paginationSchema }, async ({ query }) => adminWorkspaces(query));
