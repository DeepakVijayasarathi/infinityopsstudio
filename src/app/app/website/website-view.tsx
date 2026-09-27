"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, Eye, MessageSquare, MousePointerClick, Save, Users } from "lucide-react";
import { api } from "@/lib/api-client";
import { formatNumber, formatPercent } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendAreaChart } from "@/components/charts/charts";

type Widget = { publicKey: string; enabled: boolean; chatEnabled: boolean; aiReplies: boolean; greeting: string; accentColor: string; position: "left" | "right"; askEmailAfter: number; allowedDomains: string[] };
type Stats = { visitors: number; pageviews: number; conversions: number; conversionRate: number; series: { date: string; visitors: number; pageviews: number }[]; topPages: { path: string; views: number }[]; sources: { source: string; views: number }[] };

function CodeBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg bg-slate-950 p-4 pr-24 text-[12.5px] leading-relaxed text-slate-100" aria-label={label}>
        <code>{code}</code>
      </pre>
      <Button
        size="sm"
        variant="outline"
        className="absolute right-2 top-2 bg-card"
        onClick={() =>
          navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            toast.success("Copied");
            setTimeout(() => setCopied(false), 1500);
          })
        }
      >
        {copied ? <Check /> : <Copy />} Copy
      </Button>
    </div>
  );
}

export function WebsiteView({ widget, stats, appUrl, canEdit }: { widget: Widget; stats: Stats; appUrl: string; canEdit: boolean }) {
  const router = useRouter();
  const [w, setW] = React.useState(widget);
  const [domains, setDomains] = React.useState(widget.allowedDomains.join(", "));
  const [busy, setBusy] = React.useState(false);
  const set = <K extends keyof Widget>(k: K, v: Widget[K]) => setW((x) => ({ ...x, [k]: v }));
  const snippet = `<script src="${appUrl}/widget.js" data-key="${widget.publicKey}" defer></script>`;
  const formSnippet = `<form data-infinityops data-success="Thanks! We'll be in touch.">
  <input name="name" placeholder="Your name" required>
  <input name="email" type="email" placeholder="Work email" required>
  <input name="company" placeholder="Company">
  <textarea name="message" placeholder="How can we help?"></textarea>
  <input name="website" style="display:none" tabindex="-1" autocomplete="off">
  <button type="submit">Send</button>
</form>`;

  async function save() {
    setBusy(true);
    try {
      await api.put("website", { ...w, allowedDomains: domains.split(/[,\s]+/).filter(Boolean) });
      toast.success("Website settings saved");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Tabs defaultValue={stats.pageviews ? "traffic" : "setup"}>
      <TabsList>
        <TabsTrigger value="traffic">
          <Eye /> Traffic
        </TabsTrigger>
        <TabsTrigger value="setup">
          <MousePointerClick /> Install
        </TabsTrigger>
        <TabsTrigger value="chat">
          <MessageSquare /> Chat & forms
        </TabsTrigger>
      </TabsList>

      <TabsContent value="traffic" className="space-y-4">
        {stats.pageviews === 0 ? (
          <EmptyState icon={Eye} title="No website visits yet" description="Add the snippet from the Install tab to your website. Visits show up here within seconds." />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Visitors (30d)" value={formatNumber(stats.visitors)} icon={Users} />
              <StatCard label="Page views" value={formatNumber(stats.pageviews)} icon={Eye} />
              <StatCard label="Conversions" value={formatNumber(stats.conversions)} icon={MousePointerClick} />
              <StatCard label="Conversion rate" value={formatPercent(stats.conversionRate, 2)} icon={Check} />
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Daily visitors</CardTitle>
                <CardDescription>Unique visitors per day, last 30 days</CardDescription>
              </CardHeader>
              <CardContent>
                <TrendAreaChart data={stats.series} xKey="date" series={[{ key: "visitors", label: "Visitors" }]} height={240} />
              </CardContent>
            </Card>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Top pages</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {stats.topPages.map((p) => (
                      <li key={p.path} className="flex justify-between gap-3">
                        <span className="truncate">{p.path}</span>
                        <span className="tabular-nums text-muted-foreground">{formatNumber(p.views)}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Traffic sources</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {stats.sources.map((s) => (
                      <li key={s.source} className="flex justify-between gap-3">
                        <span className="truncate capitalize">{s.source}</span>
                        <span className="tabular-nums text-muted-foreground">{formatNumber(s.views)}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </TabsContent>

      <TabsContent value="setup" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>1. Add this line to every page</CardTitle>
            <CardDescription>Paste it before the closing &lt;/head&gt; or &lt;/body&gt; tag (WordPress: a header/footer plugin; Wix/Shopify: custom code). It tracks visits and shows the chat.</CardDescription>
          </CardHeader>
          <CardContent>
            <CodeBlock code={snippet} label="Website snippet" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>2. Turn any form into a lead form</CardTitle>
            <CardDescription>Add <code className="rounded bg-muted px-1">data-infinityops</code> to a form. Fields named name, email, phone, company and message are captured; submissions appear in Leads and run your automations.</CardDescription>
          </CardHeader>
          <CardContent>
            <CodeBlock code={formSnippet} label="Form example" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>3. Track sales or sign-ups (optional)</CardTitle>
            <CardDescription>Call this on your thank-you page or after checkout to count a conversion.</CardDescription>
          </CardHeader>
          <CardContent>
            <CodeBlock code={`<script>window.InfinityOps && InfinityOps.track("conversion")</script>`} label="Conversion snippet" />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="chat">
        <Card>
          <CardHeader>
            <CardTitle>Website chat</CardTitle>
            <CardDescription>
              Visitors chat with an AI assistant that answers from your <Link href="/app/brand" className="text-primary hover:underline">Brand Kit</Link>. Conversations land in the{" "}
              <Link href="/app/inbox" className="text-primary hover:underline">Inbox</Link>, where your team can reply; visitors who share an email become leads.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {[
              { k: "enabled" as const, label: "Website key active", hint: "Turn off to stop tracking, chat and forms everywhere." },
              { k: "chatEnabled" as const, label: "Show the chat bubble", hint: "Tracking and forms keep working when chat is off." },
              { k: "aiReplies" as const, label: "AI answers automatically", hint: "Off: messages wait in the Inbox for a person to reply." },
            ].map((o) => (
              <label key={o.k} className="flex items-start justify-between gap-4">
                <span>
                  <span className="block text-sm font-medium">{o.label}</span>
                  <span className="block text-xs text-muted-foreground">{o.hint}</span>
                </span>
                <Switch checked={w[o.k]} disabled={!canEdit} onCheckedChange={(v) => set(o.k, v)} aria-label={o.label} />
              </label>
            ))}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Greeting" htmlFor="greet" className="sm:col-span-2">
                <Input id="greet" value={w.greeting} onChange={(e) => set("greeting", e.target.value)} disabled={!canEdit} maxLength={200} />
              </Field>
              <Field label="Colour" htmlFor="color">
                <div className="flex gap-2">
                  <input type="color" value={w.accentColor} onChange={(e) => set("accentColor", e.target.value)} disabled={!canEdit} className="h-9 w-12 cursor-pointer rounded border border-input" aria-label="Pick colour" />
                  <Input id="color" value={w.accentColor} onChange={(e) => set("accentColor", e.target.value)} disabled={!canEdit} />
                </div>
              </Field>
              <Field label="Position" htmlFor="pos">
                <Select id="pos" value={w.position} onChange={(e) => set("position", e.target.value as "left" | "right")} disabled={!canEdit}>
                  <option value="right">Bottom right</option>
                  <option value="left">Bottom left</option>
                </Select>
              </Field>
              <Field label="Only allow these websites" htmlFor="domains" hint="Optional, comma-separated (e.g. yoursite.com). Empty = any site with your snippet." className="sm:col-span-2">
                <Input id="domains" value={domains} onChange={(e) => setDomains(e.target.value)} disabled={!canEdit} placeholder="yoursite.com, shop.yoursite.com" />
              </Field>
            </div>
            {canEdit && (
              <Button onClick={save} loading={busy}>
                <Save /> Save settings
              </Button>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
