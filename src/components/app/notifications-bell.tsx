"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import * as Popover from "@radix-ui/react-popover";
import { Bell, CheckCheck } from "lucide-react";
import { api } from "@/lib/api-client";
import { cn, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type N = { id: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string; type: string };

export function NotificationsBell() {
  const { data, mutate } = useSWR<{ items: N[]; unreadCount: number }>("/api/v1/notifications?limit=20", { refreshInterval: 60_000, revalidateOnFocus: true });
  const unread = data?.unreadCount ?? 0;

  async function markAll() {
    await api.post("notifications/read", { all: true });
    mutate();
  }
  async function markOne(id: string) {
    await api.post("notifications/read", { ids: [id] });
    mutate();
  }

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`} className="relative">
          <Bell />
          {unread > 0 && <span className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white">{unread > 9 ? "9+" : unread}</span>}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} className="z-50 w-[min(92vw,380px)] overflow-hidden rounded-xl border border-border bg-card shadow-xl data-[state=open]:animate-fade-in">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Notifications</h2>
            {unread > 0 && (
              <button onClick={markAll} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                <CheckCheck className="size-3.5" /> Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-[60dvh] divide-y divide-border overflow-y-auto scrollbar-thin">
            {!data && <li className="p-6 text-center text-sm text-muted-foreground">Loading…</li>}
            {data?.items.length === 0 && <li className="p-8 text-center text-sm text-muted-foreground">You&apos;re all caught up.</li>}
            {data?.items.map((n) => {
              const inner = (
                <div className={cn("flex gap-3 px-4 py-3 transition hover:bg-muted/60", !n.readAt && "bg-primary/[0.04]")}>
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug">{n.title}</p>
                    {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
                    <p className="mt-1 text-[11px] text-muted-foreground">{timeAgo(n.createdAt)}</p>
                  </div>
                </div>
              );
              return (
                <li key={n.id}>
                  {n.link ? (
                    <Popover.Close asChild>
                      <Link href={n.link} onClick={() => !n.readAt && markOne(n.id)}>
                        {inner}
                      </Link>
                    </Popover.Close>
                  ) : (
                    <button className="w-full text-left" onClick={() => !n.readAt && markOne(n.id)}>
                      {inner}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="border-t border-border px-4 py-2.5 text-center">
            <Popover.Close asChild>
              <Link href="/app/settings/notifications" className="text-xs font-medium text-muted-foreground hover:text-foreground">
                Notification settings
              </Link>
            </Popover.Close>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
