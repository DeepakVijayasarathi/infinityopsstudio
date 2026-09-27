"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";

const TIMEZONES = ["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Sao_Paulo", "Europe/London", "Europe/Berlin", "Europe/Paris", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney"];

export function WorkspaceSettings({ workspace, canManage, canDelete }: { workspace: { id: string; name: string; slug: string; industry: string | null; website: string | null; timezone: string }; canManage: boolean; canDelete: boolean }) {
  const router = useRouter();
  const [v, setV] = React.useState({ name: workspace.name, industry: workspace.industry ?? "", website: workspace.website ?? "", timezone: workspace.timezone });
  const [busy, setBusy] = React.useState(false);
  const [del, setDel] = React.useState(false);
  const [confirmName, setConfirmName] = React.useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.patch("workspaces/current", { name: v.name, industry: v.industry || null, website: v.website || null, timezone: v.timezone });
      toast.success("Workspace updated");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Workspace details</CardTitle>
          <CardDescription>URL slug: {workspace.slug}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-4">
            <fieldset disabled={!canManage} className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" htmlFor="ws-name" required>
                <Input id="ws-name" value={v.name} onChange={(e) => setV((x) => ({ ...x, name: e.target.value }))} required minLength={2} />
              </Field>
              <Field label="Industry" htmlFor="ws-ind">
                <Input id="ws-ind" value={v.industry} onChange={(e) => setV((x) => ({ ...x, industry: e.target.value }))} />
              </Field>
              <Field label="Website" htmlFor="ws-web">
                <Input id="ws-web" type="url" value={v.website} onChange={(e) => setV((x) => ({ ...x, website: e.target.value }))} placeholder="https://" />
              </Field>
              <Field label="Timezone" htmlFor="ws-tz" hint="Used for scheduling and reports.">
                <Select id="ws-tz" value={v.timezone} onChange={(e) => setV((x) => ({ ...x, timezone: e.target.value }))}>
                  {[...new Set([v.timezone, ...TIMEZONES])].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Select>
              </Field>
            </fieldset>
            {canManage ? (
              <Button type="submit" loading={busy}>
                Save changes
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Only admins can edit workspace details.</p>
            )}
          </form>
        </CardContent>
      </Card>
      {canDelete && (
        <Card className="border-danger/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-danger">
              <AlertTriangle className="size-4" /> Danger zone
            </CardTitle>
            <CardDescription>Deleting the workspace removes access for every member. Data is purged after 30 days.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={() => setDel(true)}>
              Delete workspace
            </Button>
          </CardContent>
        </Card>
      )}
      <Dialog open={del} onOpenChange={setDel}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Delete {workspace.name}?</DialogTitle>
            <DialogDescription>Type the workspace name to confirm. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={workspace.name} aria-label="Workspace name" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDel(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={confirmName !== workspace.name}
              onClick={async () => {
                try {
                  await api.del("workspaces/current", { confirmName });
                  toast.success("Workspace deleted");
                  window.location.href = "/app";
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              Delete workspace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
