import { env } from "../env";

export const SESSION_COOKIE = "ios_session";
export const WORKSPACE_COOKIE = "ios_ws";
export const OAUTH_STATE_COOKIE = "ios_oauth_state";

export function cookieBase() {
  return {
    httpOnly: true,
    // Browsers drop Secure cookies on plain http, so follow the public URL's scheme.
    secure: env().APP_URL.startsWith("https://"),
    sameSite: "lax" as const,
    path: "/",
  };
}
