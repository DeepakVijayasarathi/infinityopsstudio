"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import useSWR from "swr";
import { Bot, FileText, Megaphone, Plus, Search, Sparkles, UserPlus, Users, Workflow, File as FileIcon } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { NAV } from "./nav";
import { useCan } from "./app-context";
import * as DialogPrimitive from "@radix-ui/react-dialog";

type Result = { type: string; id: string; title: string; subtitle?: string; href: string };

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  campaign: Megaphone,
  content: FileText,
  lead: Users,
  worker: Bot,
  workflow: Workflow,
  document: FileIcon,
};

const PaletteContext = React.createContext<(open: boolean) => void>(() => undefined);
export const useCommandPalette = () => React.useContext(PaletteContext);

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <PaletteContext.Provider value={setOpen}>
      {children}
      <CommandPalette open={open} onOpenChange={setOpen} />
    </PaletteContext.Provider>
  );
}

function useDebounced<T>(value: T, ms = 200) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const can = useCan();
  const [query, setQuery] = React.useState("");
  const q = useDebounced(query.trim());
  const { data: results, isLoading } = useSWR<Result[]>(open && q.length >= 2 ? `/api/v1/search?q=${encodeURIComponent(q)}` : null);

  const go = (href: string) => {
    onOpenChange(false);
    setQuery("");
    router.push(href);
  };

  const actions = [
    { label: "Create campaign", href: "/app/campaigns?new=1", icon: Megaphone, perm: "campaigns:write" as const },
    { label: "Generate content", href: "/app/content/new", icon: Sparkles, perm: "content:write" as const },
    { label: "Create lead", href: "/app/leads?new=1", icon: UserPlus, perm: "leads:write" as const },
    { label: "Run an AI worker", href: "/app/workers", icon: Bot, perm: "workers:run" as const },
    { label: "Create automation", href: "/app/automations/new", icon: Workflow, perm: "automations:write" as const },
  ].filter((a) => can(a.perm));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="overflow-hidden p-0 sm:top-[18%] sm:translate-y-0">
        <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
        <Command shouldFilter={!q || q.length < 2} label="Command palette" className="flex max-h-[70dvh] flex-col">
          <div className="flex items-center gap-2 border-b border-border px-4">
            <Search className="size-4 text-muted-foreground" />
            <Command.Input value={query} onValueChange={setQuery} placeholder="Search campaigns, content, leads… or type a command" className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
          </div>
          <Command.List className="scrollbar-thin overflow-y-auto p-2">
            <Command.Empty className="px-3 py-8 text-center text-sm text-muted-foreground">{isLoading ? "Searching…" : "No results found."}</Command.Empty>
            {q.length >= 2 && results && results.length > 0 && (
              <Command.Group heading="Results" className="text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                {results.map((r) => {
                  const Icon = TYPE_ICON[r.type] ?? FileText;
                  return (
                    <Item key={`${r.type}-${r.id}`} value={`${r.title} ${r.subtitle ?? ""} ${r.id}`} onSelect={() => go(r.href)}>
                      <Icon className="size-4 text-muted-foreground" />
                      <span className="truncate text-foreground">{r.title}</span>
                      {r.subtitle && <span className="ml-auto truncate text-xs text-muted-foreground">{r.subtitle}</span>}
                    </Item>
                  );
                })}
              </Command.Group>
            )}
            {(!q || q.length < 2) && (
              <>
                <Command.Group heading="Quick actions" className="text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                  {actions.map((a) => (
                    <Item key={a.href} value={a.label} onSelect={() => go(a.href)}>
                      <span className="grid size-6 place-items-center rounded-md bg-primary/10 text-primary">
                        <a.icon className="size-3.5" />
                      </span>
                      <span className="text-foreground">{a.label}</span>
                      <Plus className="ml-auto size-3.5 text-muted-foreground" />
                    </Item>
                  ))}
                </Command.Group>
                <Command.Group heading="Go to" className="text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                  {NAV.filter((n) => !n.permission || can(n.permission)).map((n) => (
                    <Item key={n.href} value={`go ${n.label}`} onSelect={() => go(n.href)}>
                      <n.icon className="size-4 text-muted-foreground" />
                      <span className="text-foreground">{n.label}</span>
                    </Item>
                  ))}
                </Command.Group>
              </>
            )}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function Item({ children, ...props }: React.ComponentProps<typeof Command.Item>) {
  return (
    <Command.Item {...props} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm aria-selected:bg-muted">
      {children}
    </Command.Item>
  );
}
