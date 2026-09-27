"use client";

import * as React from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { cn } from "@/lib/utils";

/** Client-side Markdown renderer for streaming AI output. Always sanitized. */
export function Markdown({ content, className }: { content: string; className?: string }) {
  const [html, setHtml] = React.useState("");
  React.useEffect(() => {
    const raw = marked.parse(content || "", { async: false, gfm: true }) as string;
    setHtml(DOMPurify.sanitize(raw, { USE_PROFILES: { html: true }, ADD_ATTR: ["target"] }));
  }, [content]);
  return <div className={cn("prose-ios", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
