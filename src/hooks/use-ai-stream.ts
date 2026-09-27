"use client";

import * as React from "react";
import { streamAI } from "@/lib/api-client";

type Meta = { model: string; provider: string; label?: string };

/** Streams an AI endpoint into state; supports cancel. */
export function useAIStream() {
  const [text, setText] = React.useState("");
  const [streaming, setStreaming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [meta, setMeta] = React.useState<Meta | null>(null);
  const [usage, setUsage] = React.useState<{ credits: number; costMicros: number } | null>(null);
  const ctrl = React.useRef<AbortController | null>(null);

  const start = React.useCallback(async (url: string, body: unknown, opts: { append?: boolean } = {}) => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    if (!opts.append) setText("");
    setError(null);
    setUsage(null);
    setStreaming(true);
    let full = "";
    const res = await streamAI(url, body, {
      signal: c.signal,
      onMeta: setMeta,
      onToken: (t) => {
        full += t;
        setText((prev) => prev + t);
      },
      onDone: (d) => setUsage({ credits: d.credits, costMicros: d.costMicros }),
      onError: setError,
    });
    setStreaming(false);
    return { text: full, response: res };
  }, []);

  const stop = React.useCallback(() => {
    ctrl.current?.abort();
    setStreaming(false);
  }, []);

  return { text, setText, streaming, error, meta, usage, start, stop };
}
