"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Flag, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { useConfirm } from "@/components/ui/confirm";

type F = { key: string; description: string | null; enabled: boolean; rolloutPercent: number; workspaceIds: string[] };

export function FlagsView({ flags }: { flags: F[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [editing, setEditing] = React.useState<F | null>(null);

  async function save(f: F) {
    try {
      await api.post("admin/flags", f);
      toast.success(`Flag ${f.key} saved`);
      setEditing(null);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setEditing({ key: "", description: "", enabled: false, rolloutPercent: 100, workspaceIds: [] })}>
          <Plus /> New flag
        </Button>
      </div>
      {flags.length === 0 ? (
        <EmptyState icon={Flag} title="No feature flags" />
      ) : (
        <div className="space-y-2">
          {flags.map((f) => (
            <Card key={f.key} className="flex flex-wrap items-center gap-4 p-4">
              <div className="min-w-0 flex-1">
                <code className="text-sm font-semibold">{f.key}</code>
                <p className="text-xs text-muted-foreground">{f.description}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Rollout {f.rolloutPercent}%{f.workspaceIds.length ? ` · +${f.workspaceIds.length} workspace overrides` : ""}
                </p>
              </div>
              <Switch checked={f.enabled} onCheckedChange={(v) => save({ ...f, enabled: v })} aria-label={`Toggle ${f.key}`} />
              <Button size="sm" variant="outline" onClick={() => setEditing(f)}>
                Edit
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Delete ${f.key}`}
                onClick={async () => {
                  if (!(await confirm({ title: `Delete flag ${f.key}?`, destructive: true, confirmLabel: "Delete" }))) return;
                  await api.del(`admin/flags/${f.key}`);
                  toast.success("Flag deleted");
                  router.refresh();
                }}
              >
                <Trash2 />
              </Button>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent size="sm">
          {editing && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save(editing);
              }}
            >
              <DialogHeader>
                <DialogTitle>{flags.some((f) => f.key === editing.key) ? `Edit ${editing.key}` : "New feature flag"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <Field label="Key" htmlFor="f-key" hint="lowercase, dots and dashes">
                  <Input id="f-key" value={editing.key} onChange={(e) => setEditing({ ...editing, key: e.target.value })} pattern="[a-z0-9_.\-]{2,60}" required readOnly={flags.some((f) => f.key === editing.key)} />
                </Field>
                <Field label="Description" htmlFor="f-desc">
                  <Input id="f-desc" value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
                </Field>
                <Field label={`Rollout: ${editing.rolloutPercent}% of workspaces`} htmlFor="f-roll">
                  <Input id="f-roll" type="range" min={0} max={100} value={editing.rolloutPercent} onChange={(e) => setEditing({ ...editing, rolloutPercent: Number(e.target.value) })} className="h-8 px-0 accent-[hsl(var(--primary))]" />
                </Field>
                <Field label="Always-on workspace IDs" htmlFor="f-ws" hint="Comma separated">
                  <Input id="f-ws" value={editing.workspaceIds.join(", ")} onChange={(e) => setEditing({ ...editing, workspaceIds: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={editing.enabled} onCheckedChange={(v) => setEditing({ ...editing, enabled: v })} aria-label="Enabled" /> Enabled
                </label>
              </div>
              <DialogFooter>
                <Button type="submit">Save flag</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
