"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, XCircle } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";

type Model = { id: string; label: string; provider: string; configured: boolean; enabled: boolean; inputPerMTok: number; outputPerMTok: number };
type AI = { defaultModel: string | null; enabledModels: string[] | null; allowUserModelSelection: boolean; pricingOverrides: Record<string, { inputPerMTok: number; outputPerMTok: number }> };
type Platform = { signupsEnabled: boolean; maintenanceMessage: string | null; requireEmailVerification: boolean };

export function AdminSettingsForm({ ai, platform, models, runtime }: { ai: AI; platform: Platform; models: Model[]; runtime: Record<string, string | boolean> }) {
  const router = useRouter();
  const [a, setA] = React.useState<AI>(ai);
  const [p, setP] = React.useState<Platform>(platform);
  const [busy, setBusy] = React.useState<string | null>(null);
  const enabled = new Set(a.enabledModels ?? models.map((m) => m.id));

  async function save(key: "ai" | "platform") {
    setBusy(key);
    try {
      await api.put("admin/settings", { key, value: key === "ai" ? a : p });
      toast.success("Settings saved");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const price = (m: Model) => a.pricingOverrides[m.id] ?? { inputPerMTok: m.inputPerMTok, outputPerMTok: m.outputPerMTok };
  const setPrice = (m: Model, k: "inputPerMTok" | "outputPerMTok", v: number) => setA((x) => ({ ...x, pricingOverrides: { ...x.pricingOverrides, [m.id]: { ...price(m), [k]: v } } }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>AI providers & models</CardTitle>
          <CardDescription>API keys are read from server environment variables and never exposed to browsers. Only configured providers can serve requests.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Default model" htmlFor="dm" hint={`Environment default provider: ${runtime.envDefaultProvider}`}>
              <Select id="dm" value={a.defaultModel ?? ""} onChange={(e) => setA((x) => ({ ...x, defaultModel: e.target.value || null }))}>
                <option value="">Automatic (first configured provider)</option>
                {models
                  .filter((m) => m.configured)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
              </Select>
            </Field>
            <label className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
              <span className="text-sm">
                <span className="block font-medium">Allow users to choose a model</span>
                <span className="text-xs text-muted-foreground">Otherwise the default model is always used.</span>
              </span>
              <Switch checked={a.allowUserModelSelection} onCheckedChange={(v) => setA((x) => ({ ...x, allowUserModelSelection: v }))} aria-label="Allow model selection" />
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-2">Model</th>
                  <th className="py-2">Provider key</th>
                  <th className="py-2">Enabled</th>
                  <th className="py-2">Input $/1M</th>
                  <th className="py-2">Output $/1M</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {models.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2">
                      <p className="font-medium">{m.label}</p>
                      <code className="text-xs text-muted-foreground">{m.id}</code>
                    </td>
                    <td className="py-2">{m.configured ? <Badge tone="success">Configured</Badge> : <Badge>Missing key</Badge>}</td>
                    <td className="py-2">
                      <Switch
                        checked={enabled.has(m.id)}
                        aria-label={`Enable ${m.label}`}
                        onCheckedChange={(v) => {
                          const next = new Set(enabled);
                          if (v) next.add(m.id);
                          else next.delete(m.id);
                          setA((x) => ({ ...x, enabledModels: [...next] }));
                        }}
                      />
                    </td>
                    <td className="py-2">
                      <Input type="number" min={0} step="0.01" value={price(m).inputPerMTok} onChange={(e) => setPrice(m, "inputPerMTok", Number(e.target.value))} className="h-8 w-24" aria-label={`${m.label} input price`} />
                    </td>
                    <td className="py-2">
                      <Input type="number" min={0} step="0.01" value={price(m).outputPerMTok} onChange={(e) => setPrice(m, "outputPerMTok", Number(e.target.value))} className="h-8 w-24" aria-label={`${m.label} output price`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button onClick={() => save("ai")} loading={busy === "ai"}>
            Save AI settings
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Platform</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
            <span className="text-sm font-medium">Allow new signups</span>
            <Switch checked={p.signupsEnabled} onCheckedChange={(v) => setP((x) => ({ ...x, signupsEnabled: v }))} aria-label="Allow signups" />
          </label>
          <label className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
            <span className="text-sm font-medium">Require email verification</span>
            <Switch checked={p.requireEmailVerification} onCheckedChange={(v) => setP((x) => ({ ...x, requireEmailVerification: v }))} aria-label="Require email verification" />
          </label>
          <Field label="Maintenance message" htmlFor="mm" hint="Optional banner text for scheduled maintenance.">
            <Textarea id="mm" rows={2} value={p.maintenanceMessage ?? ""} onChange={(e) => setP((x) => ({ ...x, maintenanceMessage: e.target.value || null }))} />
          </Field>
          <Button onClick={() => save("platform")} loading={busy === "platform"}>
            Save platform settings
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Runtime configuration</CardTitle>
          <CardDescription>Read-only values from environment variables (see ENVIRONMENT.md).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          {Object.entries(runtime).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between rounded-lg bg-surface px-3 py-2">
              <span className="text-muted-foreground">{k}</span>
              {typeof v === "boolean" ? v ? <CheckCircle2 className="size-4 text-success" aria-label="Enabled" /> : <XCircle className="size-4 text-muted-foreground" aria-label="Disabled" /> : <code>{v}</code>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
