"use client";

import * as React from "react";
import { toast } from "sonner";
import { Globe, Wand2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type BrandDraft = Partial<{
  companyName: string;
  tagline: string | null;
  website: string | null;
  industry: string | null;
  logoUrl: string | null;
  primaryColor: string;
  voice: string | null;
  voiceAttributes: string[];
  targetAudience: string | null;
  productsServices: string | null;
  usps: string[];
  competitors: string[];
}>;

/** Reads a public website and returns a Brand Kit draft for the user to review. */
export function WebsiteAutofill({ onDraft, initialUrl = "", compact }: { onDraft: (draft: BrandDraft, meta: { usedAI: boolean }) => void; initialUrl?: string; compact?: boolean }) {
  const [url, setUrl] = React.useState(initialUrl);
  const [busy, setBusy] = React.useState(false);

  async function run() {
    if (url.trim().length < 3) return toast.error("Enter your website address, e.g. yourcompany.com");
    setBusy(true);
    try {
      const r = await api.post<{ draft: BrandDraft; usedAI: boolean }>("brand/autofill", { url: url.trim() });
      onDraft(r.draft, { usedAI: r.usedAI });
      toast.success(r.usedAI ? "Brand details drafted from your website — review and save" : "Filled what we found on your website — review and complete the rest");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={compact ? "flex gap-2" : "flex flex-col gap-2 sm:flex-row"}>
      <div className="relative flex-1">
        <Globe className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void run();
            }
          }}
          placeholder="yourcompany.com"
          aria-label="Website address"
          className="pl-9"
        />
      </div>
      <Button type="button" variant="outline" onClick={run} loading={busy}>
        <Wand2 /> Autofill from website
      </Button>
    </div>
  );
}

/** Merges only the non-empty draft values into an existing object. */
export function mergeDraft<T extends Record<string, unknown>>(current: T, draft: BrandDraft): T {
  const next = { ...current } as Record<string, unknown>;
  for (const [k, val] of Object.entries(draft)) {
    if (val === null || val === undefined || val === "" || (Array.isArray(val) && val.length === 0)) continue;
    next[k] = val;
  }
  return next as T;
}
