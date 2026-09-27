import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/server/env";
import { logger } from "@/server/logger";
import { safeEqual } from "@/server/crypto";
import { OAUTH_STATE_COOKIE } from "@/server/auth/cookies";
import { oauthLogin } from "@/server/services/auth";
import { AppError } from "@/server/errors";

export async function GET(req: NextRequest) {
  const e = env();
  const fail = (code: string) => NextResponse.redirect(`${e.APP_URL}/login?error=${code}`);
  const jar = await cookies();
  const stored = jar.get(OAUTH_STATE_COOKIE)?.value;
  jar.delete(OAUTH_STATE_COOKIE);
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!stored || !code || !state) return fail("oauth_failed");
  const [expectedState, verifier] = stored.split(".");
  if (!expectedState || !verifier || !safeEqual(expectedState, state)) return fail("oauth_state");

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: e.GOOGLE_CLIENT_ID!, client_secret: e.GOOGLE_CLIENT_SECRET!, redirect_uri: `${e.APP_URL}/api/v1/auth/google/callback`, grant_type: "authorization_code", code_verifier: verifier }),
    });
    if (!tokenRes.ok) return fail("oauth_failed");
    const tokens = (await tokenRes.json()) as { access_token: string };
    const profileRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${tokens.access_token}` } });
    if (!profileRes.ok) return fail("oauth_failed");
    const p = (await profileRes.json()) as { sub: string; email: string; email_verified: boolean; name?: string; picture?: string };
    const result = await oauthLogin(
      { provider: "google", providerAccountId: p.sub, email: p.email, emailVerified: p.email_verified, name: p.name ?? p.email.split("@")[0]!, avatarUrl: p.picture },
      { ip: req.headers.get("x-forwarded-for")?.split(",")[0] ?? null, userAgent: req.headers.get("user-agent") },
    );
    return NextResponse.redirect(`${e.APP_URL}${result.status === "two_factor_required" ? "/two-factor" : "/app"}`);
  } catch (err) {
    if (err instanceof AppError) return fail(err.code === "FORBIDDEN" ? "oauth_forbidden" : "oauth_failed");
    logger.error("Google OAuth failed", { err });
    return fail("oauth_failed");
  }
}
