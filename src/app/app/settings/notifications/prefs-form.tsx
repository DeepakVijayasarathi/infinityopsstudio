"use client";

import * as React from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/misc";

type Row = { type: string; label: string; inApp: boolean; email: boolean };

export function NotificationPrefsForm({ rows }: { rows: Row[] }) {
  const [state, setState] = React.useState(rows);
  const [busy, setBusy] = React.useState(false);
  const set = (type: string, key: "inApp" | "email", v: boolean) => setState((s) => s.map((r) => (r.type === type ? { ...r, [key]: v } : r)));
  async function save() {
    setBusy(true);
    try {
      await api.put("users/me/notifications", Object.fromEntries(state.map((r) => [r.type, { inApp: r.inApp, email: r.email }])));
      toast.success("Notification preferences saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification preferences</CardTitle>
        <CardDescription>Choose how you hear about activity in your workspaces.</CardDescription>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="py-2">Event</th>
              <th className="w-20 py-2 text-center">In-app</th>
              <th className="w-20 py-2 text-center">Email</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {state.map((r) => (
              <tr key={r.type}>
                <td className="py-3">{r.label}</td>
                <td className="py-3 text-center">
                  <Switch checked={r.inApp} onCheckedChange={(v) => set(r.type, "inApp", v)} aria-label={`${r.label} in-app`} />
                </td>
                <td className="py-3 text-center">
                  <Switch checked={r.email} onCheckedChange={(v) => set(r.type, "email", v)} aria-label={`${r.label} email`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Button className="mt-4" onClick={save} loading={busy}>
          Save preferences
        </Button>
      </CardContent>
    </Card>
  );
}
