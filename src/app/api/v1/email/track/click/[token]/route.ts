import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/server/env";
import { trackClick } from "@/server/services/email";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const url = req.nextUrl.searchParams.get("u") ?? "";
  const sig = req.nextUrl.searchParams.get("s") ?? "";
  // Signed redirects only — prevents this endpoint being abused as an open redirect.
  const target = await trackClick(token, url, sig).catch(() => null);
  return NextResponse.redirect(target ?? env().APP_URL, 302);
}
