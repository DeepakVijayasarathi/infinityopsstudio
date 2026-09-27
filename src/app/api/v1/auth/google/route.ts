import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { env } from "@/server/env";
import { randomToken } from "@/server/crypto";
import { OAUTH_STATE_COOKIE, cookieBase } from "@/server/auth/cookies";

export async function GET() {
  const e = env();
  if (!e.GOOGLE_CLIENT_ID || !e.GOOGLE_CLIENT_SECRET) {
    return NextResponse.redirect(`${e.APP_URL}/login?error=google_not_configured`);
  }
  const state = randomToken(24);
  const verifier = randomToken(48);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const jar = await cookies();
  jar.set(OAUTH_STATE_COOKIE, `${state}.${verifier}`, { ...cookieBase(), maxAge: 600 });
  const params = new URLSearchParams({
    client_id: e.GOOGLE_CLIENT_ID,
    redirect_uri: `${e.APP_URL}/api/v1/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
