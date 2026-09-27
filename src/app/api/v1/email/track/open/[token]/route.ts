import type { NextRequest } from "next/server";
import { trackOpen } from "@/server/services/email";

const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await trackOpen(token).catch(() => undefined);
  return new Response(PIXEL, { headers: { "content-type": "image/gif", "cache-control": "no-store, max-age=0" } });
}
