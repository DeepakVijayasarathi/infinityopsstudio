"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { Field, Input } from "@/components/ui/input";
import { useApp } from "./app-context";

export function WorkspaceSwitcher({ collapsed }: { collapsed?: boolean }) {
  const { workspace, workspaces, plan } = useApp();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function switchTo(id: string) {
    if (id === workspace.id) return;
    try {
      await api.post("workspaces/switch", { workspaceId: id });
      router.push("/app");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const ws = await api.post<{ id: string }>("workspaces", { name });
      await api.post("workspaces/switch", { workspaceId: ws.id });
      toast.success(`Workspace “${name}” created`);
      setOpen(false);
      setName("");
      router.push("/app");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={cn("flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition hover:bg-muted", collapsed && "justify-center")} aria-label="Switch workspace">
            <Avatar name={workspace.name} src={workspace.logoUrl} className="size-8 rounded-lg" />
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{workspace.name}</div>
                  <div className="text-[11px] text-muted-foreground">{plan.charAt(0) + plan.slice(1).toLowerCase()} plan</div>
                </div>
                <ChevronsUpDown className="size-4 text-muted-foreground" />
              </>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          {workspaces.map((w) => (
            <DropdownMenuItem key={w.id} onSelect={() => switchTo(w.id)}>
              <Avatar name={w.name} className="size-6 rounded-md" />
              <div className="min-w-0 flex-1">
                <div className="truncate">{w.name}</div>
                <div className="text-[11px] text-muted-foreground">{w.role}</div>
              </div>
              {w.id === workspace.id && <Check className="!text-primary" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setOpen(true)}>
            <Plus /> Create workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <form onSubmit={create}>
            <DialogHeader>
              <DialogTitle>Create a workspace</DialogTitle>
              <DialogDescription>Workspaces keep campaigns, content, leads and billing separate — ideal for agencies and multiple brands.</DialogDescription>
            </DialogHeader>
            <Field label="Workspace name" htmlFor="ws-name" required>
              <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Marketing" required minLength={2} autoFocus />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={busy} disabled={name.trim().length < 2}>
                Create workspace
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
