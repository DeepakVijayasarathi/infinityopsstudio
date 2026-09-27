"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, FileText, LayoutDashboard, Megaphone, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { isActive } from "./nav";

const ITEMS = [
  { href: "/app", label: "Home", icon: LayoutDashboard },
  { href: "/app/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/app/workers", label: "Workers", icon: Bot },
  { href: "/app/content", label: "Content", icon: FileText },
  { href: "/app/leads", label: "Leads", icon: Users },
];

/** Bottom tab bar for phones. */
export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="glass fixed inset-x-0 bottom-0 z-30 border-t border-border pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Primary">
      <ul className="grid grid-cols-5">
        {ITEMS.map((i) => {
          const active = isActive(pathname, i.href);
          return (
            <li key={i.href}>
              <Link href={i.href} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium", active ? "text-primary" : "text-muted-foreground")}>
                <i.icon className="size-5" />
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
