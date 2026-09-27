"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Keeps list filters in the URL (shareable, back-button friendly). */
export function useQueryState() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = React.useTransition();

  const set = React.useCallback(
    (patch: Record<string, string | number | null | undefined>, opts: { resetPage?: boolean } = { resetPage: true }) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined || v === "") next.delete(k);
        else next.set(k, String(v));
      }
      if (opts.resetPage && !("page" in patch)) next.delete("page");
      const qs = next.toString();
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [params, pathname, router],
  );

  return { params, get: (k: string) => params.get(k) ?? "", set, pending };
}

export function useDebouncedCallback<A extends unknown[]>(fn: (...args: A) => void, ms = 300) {
  const t = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  return React.useCallback(
    (...args: A) => {
      if (t.current) clearTimeout(t.current);
      t.current = setTimeout(() => fn(...args), ms);
    },
    [fn, ms],
  );
}
