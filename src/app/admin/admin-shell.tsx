"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Bot, Building2, CreditCard, Flag, FileText, LayoutDashboard, ScrollText, Settings, ShieldCheck, Users, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/app/logo";
import { ThemeToggle } from "@/components/app/theme-toggle";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/workspaces", label: "Workspaces", icon: Building2 },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard },
  { href: "/admin/ai", label: "AI usage & costs", icon: Bot },
  { href: "/admin/content", label: "Campaigns, content & workers", icon: FileText },
  { href: "/admin/logs", label: "System logs", icon: ScrollText },
  { href: "/admin/audit", label: "Audit logs", icon: History },
  { href: "/admin/flags", label: "Feature flags", icon: Flag },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function AdminShell({ user, children }: { user: { name: string; email: string }; children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-14 items-center px-4">
          <Logo href="/admin" />
        </div>
        <div className="mx-3 mb-3 flex items-center gap-2 rounded-lg bg-danger/10 px-3 py-2 text-xs font-medium text-danger">
          <ShieldCheck className="size-4" /> Platform administration
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3" aria-label="Admin">
          {NAV.map((n) => {
            const active = n.href === "/admin" ? pathname === "/admin" : pathname.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium", active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                <n.icon className="size-[18px]" /> {n.label}
              </Link>
            );
          })}
        </nav>
        <Link href="/app" className="m-3 flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted-foreground hover:bg-muted">
          <ArrowLeft className="size-4" /> Back to app
        </Link>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border px-4 sm:px-6">
          <div className="lg:hidden">
            <Logo href="/admin" compact />
          </div>
          <nav className="flex gap-1 overflow-x-auto lg:hidden" aria-label="Admin sections">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={cn("shrink-0 rounded-md px-2 py-1 text-xs", pathname === n.href ? "bg-muted font-medium" : "text-muted-foreground")}>
                {n.label.split(" ")[0]}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="hidden text-muted-foreground sm:inline">{user.email}</span>
            <ThemeToggle />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
