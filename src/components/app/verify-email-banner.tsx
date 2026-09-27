"use client";

import * as React from "react";
import { toast } from "sonner";
import { MailWarning } from "lucide-react";
import { api } from "@/lib/api-client";

export function VerifyEmailBanner() {
  const [sent, setSent] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  async function resend() {
    setBusy(true);
    try {
      await api.post("auth/verify-email/resend");
      setSent(true);
      toast.success("Verification email sent. Check your inbox.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-warning/25 bg-warning/10 px-4 py-2 text-[13px] sm:px-6">
      <MailWarning className="size-4 text-warning" />
      <span>Please verify your email address to secure your account.</span>
      <button onClick={resend} disabled={busy || sent} className="font-medium text-primary hover:underline disabled:opacity-60">
        {sent ? "Email sent" : busy ? "Sending…" : "Resend verification email"}
      </button>
    </div>
  );
}
