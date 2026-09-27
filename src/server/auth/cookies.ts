export const SESSION_COOKIE = "ios_session";
export const WORKSPACE_COOKIE = "ios_ws";
export const OAUTH_STATE_COOKIE = "ios_oauth_state";

export function cookieBase() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
}
