import { z } from "zod";
import { route } from "@/server/api";
import { paginationSchema } from "@/server/pagination";
import { socialPostSchema } from "@/lib/schemas";
import { SOCIAL_PLATFORMS, SOCIAL_POST_STATUSES } from "@/lib/constants";
import { createPost, listPosts } from "@/server/services/social";

const q = paginationSchema.extend({ status: z.enum(SOCIAL_POST_STATUSES).optional(), platform: z.enum(SOCIAL_PLATFORMS).optional() });
export const GET = route({ permission: "social:read", query: q }, async ({ ctx, query }) => listPosts(ctx.workspace.id, query));
export const POST = route({ permission: "social:write", body: socialPostSchema }, async ({ ctx, body }) => createPost(ctx, body));
