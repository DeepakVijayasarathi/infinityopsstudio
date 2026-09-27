import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/server/env";
import { unsubscribe } from "@/server/services/email";

// RFC 8058 one-click unsubscribe (mail clients POST here) and the confirmation form on /unsubscribe/[token].
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await unsubscribe(token).catch(() => null);
  const fromForm = (req.headers.get("content-type") ?? "").includes("application/x-www-form-urlencoded") && !(await req.clone().text()).includes("List-Unsubscribe=One-Click");
  if (fromForm) return NextResponse.redirect(`${env().APP_URL}/unsubscribe/${token}?done=${result ? 1 : 0}`, 303);
  return NextResponse.json({ ok: !!result }, { status: result ? 200 : 404 });
}
