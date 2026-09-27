import type { Metadata } from "next";
import { requireContext } from "@/server/page-context";
import { listMemberships } from "@/server/tenant";
import { AppProvider } from "@/components/app/app-context";
import { Sidebar } from "@/components/app/sidebar";
import { Topbar } from "@/components/app/topbar";
import { MobileNav } from "@/components/app/mobile-nav";
import { CommandPaletteProvider } from "@/components/app/command-palette";
import { SessionKeepAlive } from "@/components/app/session-keepalive";
import { VerifyEmailBanner } from "@/components/app/verify-email-banner";
import { DEFAULT_PLATFORM_SETTINGS, getSetting } from "@/server/settings";
import { Megaphone } from "lucide-react";

export const metadata: Metadata = { title: { default: "Dashboard", template: "%s · InfinityOps Studio" }, robots: { index: false } };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  const [memberships, platform] = await Promise.all([listMemberships(ctx.user.id), getSetting("platform", DEFAULT_PLATFORM_SETTINGS)]);
  const value = {
    user: {
      id: ctx.user.id,
      name: ctx.user.name,
      email: ctx.user.email,
      avatarUrl: ctx.user.avatarUrl,
      platformRole: ctx.user.platformRole,
      emailVerifiedAt: ctx.user.emailVerifiedAt?.toISOString() ?? null,
    },
    workspace: { id: ctx.workspace.id, name: ctx.workspace.name, slug: ctx.workspace.slug, logoUrl: ctx.workspace.logoUrl },
    role: { key: ctx.role.key, name: ctx.role.name, permissions: ctx.role.permissions },
    plan: ctx.plan,
    workspaces: memberships.map((m) => ({ id: m.workspace.id, name: m.workspace.name, slug: m.workspace.slug, role: m.role.name })),
  };
  return (
    <AppProvider value={value}>
      <CommandPaletteProvider>
        <div className="flex min-h-dvh bg-background">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar />
            {platform.maintenanceMessage && (
              <div role="status" className="flex items-center gap-2 border-b border-info/25 bg-info/10 px-4 py-2 text-[13px] sm:px-6">
                <Megaphone className="size-4 text-info" /> {platform.maintenanceMessage}
              </div>
            )}
            {!ctx.user.emailVerifiedAt && <VerifyEmailBanner />}
            <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-10">
              {children}
            </main>
          </div>
        </div>
        <MobileNav />
        <SessionKeepAlive />
      </CommandPaletteProvider>
    </AppProvider>
  );
}
