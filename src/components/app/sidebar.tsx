"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/misc";
import { Logo } from "./logo";
import { NAV, NAV_SECTIONS, isActive } from "./nav";
import { useApp, useCan } from "./app-context";
import { WorkspaceSwitcher } from "./workspace-switcher";

export function SidebarNav({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const can = useCan();
  const { user } = useApp();
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2 scrollbar-thin" aria-label="Main">
      {NAV_SECTIONS.map((section) => {
        const items = NAV.filter((n) => n.section === section.key && (!n.permission || can(n.permission)));
        if (!items.length) return null;
        return (
          <div key={section.key}>
            {!collapsed && <div className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">{section.label}</div>}
            <ul className="space-y-0.5">
              {items.map((item) => {
                const active = isActive(pathname, item.href);
                const link = (
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors",
                      active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      collapsed && "justify-center px-0",
                    )}
                  >
                    <item.icon className={cn("size-[18px] shrink-0", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
                return (
                  <li key={item.href}>
                    {collapsed ? (
                      <Tooltip content={item.label} side="right">
                        {link}
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {user.platformRole === "SUPER_ADMIN" && (
        <Link href="/admin" onClick={onNavigate} className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground", collapsed && "justify-center px-0")}>
          <ShieldCheck className="size-[18px]" />
          {!collapsed && "Admin panel"}
        </Link>
      )}
    </nav>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = React.useState(false);
  React.useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("ios:sidebar") === "1");
    } catch {
      /* storage unavailable */
    }
  }, []);
  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("ios:sidebar", c ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !c;
    });
  };
  return (
    <aside className={cn("sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 lg:flex", collapsed ? "w-[68px]" : "w-64")}>
      <div className={cn("flex h-14 items-center px-4", collapsed ? "justify-center" : "justify-between")}>
        <Logo href="/app" compact={collapsed} />
        {!collapsed && (
          <button onClick={toggle} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Collapse sidebar">
            <PanelLeftClose className="size-4" />
          </button>
        )}
      </div>
      <div className="px-3 pb-2">
        <WorkspaceSwitcher collapsed={collapsed} />
      </div>
      <SidebarNav collapsed={collapsed} />
      {collapsed && (
        <button onClick={toggle} className="mx-auto mb-3 rounded-md p-2 text-muted-foreground hover:bg-muted" aria-label="Expand sidebar">
          <PanelLeftOpen className="size-4" />
        </button>
      )}
    </aside>
  );
}
