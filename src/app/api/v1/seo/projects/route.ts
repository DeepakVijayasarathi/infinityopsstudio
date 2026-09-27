import { route } from "@/server/api";
import { seoProjectSchema } from "@/lib/schemas";
import { createProject, listProjects } from "@/server/services/seo";

export const GET = route({ permission: "seo:read" }, async ({ ctx }) => listProjects(ctx.workspace.id));
export const POST = route({ permission: "seo:write", body: seoProjectSchema }, async ({ ctx, body }) => createProject(ctx, body));
