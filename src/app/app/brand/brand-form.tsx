"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Save, X } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Progress } from "@/components/ui/misc";
import { mergeDraft, WebsiteAutofill } from "@/components/app/website-autofill";

type Kit = {
  companyName: string;
  tagline: string | null;
  logoUrl: string | null;
  website: string | null;
  industry: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  headingFont: string;
  bodyFont: string;
  voice: string | null;
  voiceAttributes: string[];
  targetAudience: string | null;
  productsServices: string | null;
  usps: string[];
  competitors: string[];
  guidelines: string | null;
  dos: string[];
  donts: string[];
};

const FONTS = ["Inter", "Manrope", "DM Sans", "Plus Jakarta Sans", "Poppins", "Roboto", "Lato", "Montserrat", "Playfair Display", "Merriweather", "Source Serif 4", "IBM Plex Sans"];

function ListEditor({ label, values, onChange, placeholder, disabled, hint }: { label: string; values: string[]; onChange: (v: string[]) => void; placeholder: string; disabled?: boolean; hint?: string }) {
  const [draft, setDraft] = React.useState("");
  const add = () => {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft("");
  };
  return (
    <div className="space-y-1.5">
      <p className="text-[13px] font-medium">{label}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <ul className="space-y-1">
        {values.map((v, i) => (
          <li key={v} className="flex items-center gap-2 rounded-lg bg-surface px-3 py-1.5 text-sm">
            <span className="min-w-0 flex-1">{v}</span>
            {!disabled && (
              <button type="button" onClick={() => onChange(values.filter((_, j) => j !== i))} aria-label={`Remove ${v}`} className="text-muted-foreground hover:text-danger">
                <X className="size-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {!disabled && (
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder={placeholder}
            aria-label={`Add to ${label}`}
            className="h-8"
          />
          <Button type="button" size="sm" variant="outline" onClick={add} aria-label={`Add ${label}`}>
            <Plus />
          </Button>
        </div>
      )}
    </div>
  );
}

function ColorField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <Field label={label} htmlFor={label}>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-label={`${label} picker`} className="size-9 cursor-pointer rounded-lg border border-input bg-card p-1" />
        <Input id={label} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="font-mono uppercase" maxLength={7} />
      </div>
    </Field>
  );
}

export function BrandForm({ kit, completeness, canEdit }: { kit: Kit; completeness: number; canEdit: boolean }) {
  const router = useRouter();
  const [v, setV] = React.useState<Kit>(kit);
  const [busy, setBusy] = React.useState(false);
  const set = <K extends keyof Kit>(k: K, val: Kit[K]) => setV((x) => ({ ...x, [k]: val }));
  const text = (k: keyof Kit) => ({ value: (v[k] as string | null) ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value as never), disabled: !canEdit });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put("brand", v);
      toast.success("Brand Kit saved — AI workers will use it immediately");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        {canEdit && (
          <Card className="border-primary/25">
            <CardHeader>
              <CardTitle>Fill this in automatically</CardTitle>
              <CardDescription>Enter your website and we&apos;ll draft your company details. Nothing is saved until you click Save.</CardDescription>
            </CardHeader>
            <CardContent>
              <WebsiteAutofill initialUrl={v.website ?? ""} onDraft={(d) => setV((x) => mergeDraft(x, d))} />
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Company</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Company name" htmlFor="companyName" required>
              <Input id="companyName" {...text("companyName")} />
            </Field>
            <Field label="Tagline" htmlFor="tagline">
              <Input id="tagline" {...text("tagline")} />
            </Field>
            <Field label="Website" htmlFor="website">
              <Input id="website" type="url" {...text("website")} />
            </Field>
            <Field label="Industry" htmlFor="industry">
              <Input id="industry" {...text("industry")} />
            </Field>
            <Field label="Logo URL" htmlFor="logoUrl" className="sm:col-span-2" hint="Upload files in Settings → Files, then paste the link here.">
              <Input id="logoUrl" type="url" {...text("logoUrl")} />
            </Field>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Voice & audience</CardTitle>
            <CardDescription>The most important section for AI output quality.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Brand voice" htmlFor="voice" hint="Describe how you sound in 1–3 sentences.">
              <Textarea id="voice" rows={3} {...text("voice")} placeholder="Confident, practical and warm. We explain with real numbers — never hype." />
            </Field>
            <ListEditor label="Voice attributes" values={v.voiceAttributes} onChange={(x) => set("voiceAttributes", x)} placeholder="e.g. Practical" disabled={!canEdit} />
            <Field label="Target audience" htmlFor="targetAudience">
              <Textarea id="targetAudience" rows={3} {...text("targetAudience")} placeholder="Roles, company size, pains, motivations…" />
            </Field>
            <Field label="Products & services" htmlFor="productsServices">
              <Textarea id="productsServices" rows={3} {...text("productsServices")} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <ListEditor label="Unique selling points" values={v.usps} onChange={(x) => set("usps", x)} placeholder="What only you can claim" disabled={!canEdit} />
              <ListEditor label="Competitors" values={v.competitors} onChange={(x) => set("competitors", x)} placeholder="Competitor name" disabled={!canEdit} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Guidelines</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <ListEditor label="Always" values={v.dos} onChange={(x) => set("dos", x)} placeholder="Use active voice" disabled={!canEdit} />
              <ListEditor label="Never" values={v.donts} onChange={(x) => set("donts", x)} placeholder="Say 'revolutionary'" disabled={!canEdit} />
            </div>
            <Field label="Additional brand guidelines" htmlFor="guidelines">
              <Textarea id="guidelines" rows={5} {...text("guidelines")} />
            </Field>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Visual identity</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <ColorField label="Primary color" value={v.primaryColor} onChange={(x) => set("primaryColor", x)} disabled={!canEdit} />
            <ColorField label="Secondary color" value={v.secondaryColor} onChange={(x) => set("secondaryColor", x)} disabled={!canEdit} />
            <ColorField label="Accent color" value={v.accentColor} onChange={(x) => set("accentColor", x)} disabled={!canEdit} />
            <Field label="Heading font" htmlFor="headingFont">
              <Select id="headingFont" value={v.headingFont} onChange={(e) => set("headingFont", e.target.value)} disabled={!canEdit}>
                {[...new Set([v.headingFont, ...FONTS])].map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </Select>
            </Field>
            <Field label="Body font" htmlFor="bodyFont">
              <Select id="bodyFont" value={v.bodyFont} onChange={(e) => set("bodyFont", e.target.value)} disabled={!canEdit}>
                {[...new Set([v.bodyFont, ...FONTS])].map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </Select>
            </Field>
          </CardContent>
        </Card>
      </div>
      <div className="space-y-4 xl:sticky xl:top-20 xl:h-fit">
        <Card className="p-5">
          <p className="text-sm font-medium">Brand Kit completeness</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{completeness}%</p>
          <Progress value={completeness} className="mt-3" tone={completeness >= 80 ? "success" : completeness >= 50 ? "primary" : "warning"} />
          <p className="mt-3 text-xs text-muted-foreground">A complete kit produces noticeably more on-brand AI output.</p>
          {canEdit && (
            <Button type="submit" className="mt-4 w-full" loading={busy}>
              <Save /> Save Brand Kit
            </Button>
          )}
        </Card>
        <Card className="overflow-hidden">
          <div className="p-5" style={{ background: `linear-gradient(135deg, ${v.primaryColor}, ${v.secondaryColor})` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {v.logoUrl ? <img src={v.logoUrl} alt={`${v.companyName} logo`} className="h-10 w-auto rounded bg-white/90 p-1" /> : <span className="text-lg font-bold text-white">{v.companyName}</span>}
            <p className="mt-6 text-xl font-semibold text-white" style={{ fontFamily: v.headingFont }}>
              {v.tagline || "Your tagline here"}
            </p>
          </div>
          <div className="space-y-2 p-5 text-sm" style={{ fontFamily: v.bodyFont }}>
            <p className="text-muted-foreground">{v.voice || "Your brand voice description appears here."}</p>
            <span className="inline-block rounded-md px-3 py-1.5 text-xs font-medium text-white" style={{ background: v.accentColor }}>
              Call to action
            </span>
          </div>
        </Card>
      </div>
    </form>
  );
}
