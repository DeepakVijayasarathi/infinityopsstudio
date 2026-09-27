import { z } from "zod";
import { route } from "@/server/api";
import { logger } from "@/server/logger";
import { AUTOPILOT_CHANNELS, runAutopilot } from "@/server/services/autopilot";

const schema = z.object({
  goal: z.string().trim().min(10, "Describe the goal in a sentence (at least 10 characters)").max(500),
  audience: z.string().trim().max(300).optional().nullable(),
  channels: z.array(z.enum(AUTOPILOT_CHANNELS)).min(1, "Pick at least one channel").max(AUTOPILOT_CHANNELS.length),
  durationWeeks: z.coerce.number().int().min(1).max(12).default(4),
  budget: z.coerce.number().min(0).max(10_000_000).optional(),
  postsPerChannel: z.coerce.number().int().min(1).max(6).optional(),
});

/**
 * Streams the autopilot's progress as Server-Sent Events (`step`, `done`, `error`).
 * The run continues to completion even if the browser disconnects, so nothing is left half-built.
 */
export const POST = route({ permission: "campaigns:write", body: schema, rateLimit: { limit: 10, windowSec: 3600, key: "autopilot" } }, async ({ ctx, body }) => {
  const encoder = new TextEncoder();
  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          open = false;
        }
      };
      try {
        for await (const e of runAutopilot(ctx!, { goal: body.goal, audience: body.audience, channels: body.channels, durationWeeks: body.durationWeeks, budgetCents: body.budget ? Math.round(body.budget * 100) : undefined, postsPerChannel: body.postsPerChannel })) {
          send(e.type, e);
        }
      } catch (err) {
        logger.error("Autopilot failed", { err });
        send("error", { message: err instanceof Error ? err.message : "The autopilot failed" });
      } finally {
        if (open) controller.close();
      }
    },
    cancel() {
      open = false;
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
});
