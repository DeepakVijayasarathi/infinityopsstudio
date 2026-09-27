"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Building2, FolderOpen, ShieldCheck, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/app/settings", label: "Workspace", icon: Building2 },
  { href: "/app/settings/team", label: "Team & roles", icon: Users },
  { href: "/app/settings/profile", label: "Profile & security", icon: ShieldCheck },
  { href: "/app/settings/notifications", label: "Notifications", icon: Bell },
  { href: "/app/settings/files", label: "Files", icon: FolderOpen },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings" className="flex gap-1 overflow-x-auto lg:flex-col scrollbar-thin">
      {ITEMS.map((i) => {
        const active = pathname === i.href;
        return (
          <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined} className={cn("flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium", active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
            <i.icon className="size-4" /> {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
