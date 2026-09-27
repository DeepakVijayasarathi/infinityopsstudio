"use client";

import * as React from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { SWRConfig } from "swr";
import { ConfirmProvider } from "@/components/ui/confirm";
import { fetcher } from "@/lib/api-client";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <SWRConfig value={{ fetcher, revalidateOnFocus: false, dedupingInterval: 5000, shouldRetryOnError: false }}>
        <ConfirmProvider>
          {children}
          <Toaster richColors closeButton position="bottom-right" toastOptions={{ className: "font-sans" }} />
        </ConfirmProvider>
      </SWRConfig>
    </ThemeProvider>
  );
}
