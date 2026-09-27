"use client";

import * as React from "react";
import type { Permission } from "@/config/permissions";

export type AppContextValue = {
  user: { id: string; name: string; email: string; avatarUrl: string | null; platformRole: string; emailVerifiedAt: string | null };
  workspace: { id: string; name: string; slug: string; logoUrl: string | null };
  role: { key: string; name: string; permissions: string[] };
  plan: string;
  workspaces: { id: string; name: string; slug: string; role: string }[];
};

const Ctx = React.createContext<AppContextValue | null>(null);

export function AppProvider({ value, children }: { value: AppContextValue; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useApp must be used within AppProvider");
  return v;
}

/** Client-side permission check for showing/hiding controls (the API enforces it again). */
export function useCan() {
  const { role } = useApp();
  return React.useCallback((p: Permission) => role.permissions.includes(p), [role.permissions]);
}
