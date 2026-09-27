"use client";

import * as React from "react";

/** Periodically rotates the session token while the app is open (refresh-token rotation). */
export function SessionKeepAlive() {
  React.useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") fetch("/api/v1/auth/refresh", { method: "POST" }).catch(() => undefined);
    };
    const t = setInterval(refresh, 10 * 60_000);
    return () => clearInterval(t);
  }, []);
  return null;
}
