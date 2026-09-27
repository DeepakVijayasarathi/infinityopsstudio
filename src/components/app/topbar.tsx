"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronRight, LogOut, Menu, Search, Settings, User } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Avatar, Kbd } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { useApp } from "./app-context";
import { NAV } from "./nav";
import { ThemeToggle } from "./theme-toggle";
import { NotificationsBell } from "./notifications-bell";
import { useCommandPalette } from "./command-palette";
import { SidebarNav } from "./sidebar";
import { Logo } from "./logo";
import { WorkspaceSwitcher } from "./workspace-switcher";

function Breadcrumbs() {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean).slice(1); // drop "app"
  const crumbs: { href: string; label: string }[] = [{ href: "/app", label: "Overview" }];
  let href = "/app";
  for (const p of parts) {
    href += `/${p}`;
    const nav = NAV.find((n) => n.href === href);
    const label = nav?.label ?? (p.length > 20 || /^c[a-z0-9]{20,}$/.test(p) ? "Details" : p.charAt(0).toUpperCase() + p.slice(1).replace(/-/g, " "));
    crumbs.push({ href, label });
  }
  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1 text-sm md:flex">
      {crumbs.map((c, i) => (
        <React.Fragment key={c.href}>
          {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />}
          {i === crumbs.length - 1 ? (
            <span className="truncate font-medium" aria-current="page">
              {c.label}
            </span>
          ) : (
            <Link href={c.href} className="truncate text-muted-foreground hover:text-foreground">
              {c.label}
            </Link>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

export function Topbar() {
  const { user } = useApp();
  const router = useRouter();
  const openPalette = useCommandPalette();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  async function logout() {
    try {
      await api.post("auth/logout");
      router.push("/login");
      router.refresh();
    } catch {
      toast.error("Could not sign out. Try again.");
    }
  }

  return (
    <header className="glass sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border px-4 sm:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
        <Menu />
      </Button>
      <div className="lg:hidden">
        <Logo href="/app" compact />
      </div>
      <Breadcrumbs />
      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={() => openPalette(true)}
          className="hidden h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground transition hover:border-ring/50 hover:text-foreground sm:flex sm:w-56 lg:w-72"
          aria-label="Search (Ctrl+K)"
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">Search…</span>
          <Kbd>⌘K</Kbd>
        </button>
        <Button variant="ghost" size="icon" className="sm:hidden" onClick={() => openPalette(true)} aria-label="Search">
          <Search />
        </Button>
        <NotificationsBell />
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="ml-1 rounded-full" aria-label="Account menu">
              <Avatar name={user.name} src={user.avatarUrl} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-60">
            <DropdownMenuLabel className="text-foreground">
              <div className="truncate font-medium">{user.name}</div>
              <div className="truncate text-xs font-normal text-muted-foreground">{user.email}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => router.push("/app/settings/profile")}>
              <User /> Profile & security
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => router.push("/app/settings")}>
              <Settings /> Workspace settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={logout} destructive>
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen} title="Navigation">
        <div className="flex h-14 items-center px-4">
          <Logo href="/app" />
        </div>
        <div className="px-3 pb-2">
          <WorkspaceSwitcher />
        </div>
        <SidebarNav onNavigate={() => setMobileOpen(false)} />
      </Sheet>
    </header>
  );
}
