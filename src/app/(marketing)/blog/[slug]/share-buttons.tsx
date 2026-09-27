"use client";

import { toast } from "sonner";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ShareButtons({ url, title }: { url: string; title: string }) {
  const enc = encodeURIComponent;
  const links = [
    { label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}` },
    { label: "X", href: `https://x.com/intent/tweet?url=${enc(url)}&text=${enc(title)}` },
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}` },
  ];
  async function copy() {
    try {
      if (navigator.share) await navigator.share({ title, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
      }
    } catch {
      /* user cancelled */
    }
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">Share</span>
      {links.map((l) => (
        <Button key={l.label} asChild size="sm" variant="outline">
          <a href={l.href} target="_blank" rel="noopener noreferrer" aria-label={`Share on ${l.label}`}>
            {l.label}
          </a>
        </Button>
      ))}
      <Button size="icon-sm" variant="outline" onClick={copy} aria-label="Copy link">
        <Link2 />
      </Button>
    </div>
  );
}
