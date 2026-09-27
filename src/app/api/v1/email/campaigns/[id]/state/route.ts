import { z } from "zod";
import { route } from "@/server/api";
import { setSequenceState } from "@/server/services/email";

export const POST = route({ permission: "email:write", body: z.object({ state: z.enum(["PAUSED", "ACTIVE", "CANCELLED"]) }) }, async ({ ctx, params, body }) => setSequenceState(ctx, params.id!, body.state));
