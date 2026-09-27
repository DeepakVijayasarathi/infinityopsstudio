"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, PlugZap, RefreshCw, ShieldCheck, Unplug } from "lucide-react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { TimeAgo } from "@/components/ui/time";
import { useConfirm } from "@/components/ui/confirm";

type FieldDef = { key: string; label: string; type: "text" | "password" | "url"; required?: boolean; secret?: boolean; placeholder?: string; help?: string };
type Item = {
  key: string;
  name: string;
  category: string;
  description: string;
  logo: string;
  color: string;
  fields: FieldDef[];
  capabilities: string[];
  docsUrl?: string;
  availability: "available" | "admin" | "coming_soon";
  testable: boolean;
  connection: { id: string | null; status: "CONNECTED" | "ERROR" | "DISCONNECTED"; config: Record<string, string> | null; lastSyncAt: string | null; error: string | null } | null;
};

export function IntegrationsView({ items, categories, canManage }: { items: Item[]; categories: string[]; canManage: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [cat, setCat] = React.useState<string>("All");
  const [active, setActive] = React.useState<Item | null>(null);
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState<string | null>(null);
  const shown = cat === "All" ? items : items.filter((i) => i.category === cat);
  const connected = items.filter((i) => i.connection?.status === "CONNECTED").length;

  function open(i: Item) {
    setActive(i);
    setValues(Object.fromEntries(i.fields.filter((f) => !f.secret).map((f) => [f.key, i.connection?.config?.[f.key] ?? ""])));
  }

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    if (!active) return;
    setBusy("connect");
    try {
      const r = await api.post<{ status: string; test: { ok: boolean; message: string } | null }>(`integrations/${active.key}`, { values });
      if (r.test && !r.test.ok) toast.warning(`Saved, but the connection test failed: ${r.test.message}`);
      else toast.success(r.test?.message ?? `${active.name} connected`);
      setActive(null);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function test(i: Item) {
    setBusy(`test-${i.key}`);
    try {
      const r = await api.post<{ ok: boolean; message: string }>(`integrations/${i.key}/test`);
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Category">
          {["All", ...categories].map((c) => (
            <button key={c} role="radio" aria-checked={cat === c} onClick={() => setCat(c)} className={cn("rounded-full border px-3 py-1 text-sm transition", cat === c ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
              {c}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{connected} connected</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((i) => {
          const status = i.connection?.status;
          return (
            <Card key={i.key} className="flex flex-col p-5">
              <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl text-sm font-bold text-white" style={{ background: i.color }}>
                  {i.logo}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold">{i.name}</h2>
                  <p className="text-xs text-muted-foreground">{i.category}</p>
                </div>
                {status === "CONNECTED" && (
                  <Badge tone="success" dot>
                    Connected
                  </Badge>
                )}
                {status === "ERROR" && (
                  <Badge tone="danger" dot>
                    Needs attention
                  </Badge>
                )}
              </div>
              <p className="mt-3 flex-1 text-sm text-muted-foreground">{i.description}</p>
              {i.connection?.error && <p className="mt-2 rounded-md bg-danger/10 p-2 text-xs text-danger">{i.connection.error}</p>}
              {i.connection?.lastSyncAt && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Last checked <TimeAgo date={i.connection.lastSyncAt} />
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                {i.availability === "coming_soon" ? (
                  <Badge>Coming soon</Badge>
                ) : i.availability === "admin" ? (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ShieldCheck className="size-4" /> {status === "CONNECTED" ? "Enabled by your platform administrator" : "Configured platform-wide by an administrator"}
                  </p>
                ) : canManage ? (
                  <>
                    <Button size="sm" variant={status ? "outline" : "default"} onClick={() => open(i)}>
                      {status ? <RefreshCw /> : <PlugZap />} {status ? "Update" : "Connect"}
                    </Button>
                    {status && i.testable && (
                      <Button size="sm" variant="outline" onClick={() => test(i)} loading={busy === `test-${i.key}`}>
                        <CheckCircle2 /> Test
                      </Button>
                    )}
                    {status && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-danger"
                        onClick={async () => {
                          if (!(await confirm({ title: `Disconnect ${i.name}?`, description: "Stored credentials are deleted. Automations using it will fail until you reconnect.", destructive: true, confirmLabel: "Disconnect" }))) return;
                          try {
                            await api.del(`integrations/${i.key}`);
                            toast.success(`${i.name} disconnected`);
                            router.refresh();
                          } catch (e) {
                            toast.error((e as Error).message);
                          }
                        }}
                      >
                        <Unplug /> Disconnect
                      </Button>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">Ask an admin to manage integrations.</p>
                )}
                {i.docsUrl && (
                  <a href={i.docsUrl} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 self-center text-xs text-muted-foreground hover:text-foreground">
                    Docs <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent>
          {active && (
            <form onSubmit={connect}>
              <DialogHeader>
                <DialogTitle>Connect {active.name}</DialogTitle>
                <DialogDescription>Secrets are encrypted with AES-256-GCM and never shown again or sent to the browser.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {active.fields.map((f) => (
                  <Field key={f.key} label={f.label} htmlFor={`i-${f.key}`} required={f.required} hint={f.help ?? (f.secret && active.connection ? "Saved secrets are never displayed — re-enter it to update the connection." : undefined)}>
                    <Input id={`i-${f.key}`} type={f.type} autoComplete="off" value={values[f.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} placeholder={f.placeholder} required={f.required} />
                  </Field>
                ))}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setActive(null)}>
                  Cancel
                </Button>
                <Button type="submit" loading={busy === "connect"}>
                  {active.testable ? "Connect & test" : "Save connection"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
