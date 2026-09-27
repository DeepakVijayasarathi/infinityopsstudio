"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, MailCheck } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/auth/form-alert";

function Verify() {
  const token = useSearchParams().get("token");
  const [state, setState] = React.useState<"loading" | "ok" | "error">(token ? "loading" : "error");
  const [message, setMessage] = React.useState("This verification link is missing its token.");
  const ran = React.useRef(false);
  React.useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    api
      .post("auth/verify-email", { token })
      .then(() => setState("ok"))
      .catch((e: Error) => {
        setMessage(e.message);
        setState("error");
      });
  }, [token]);
  return (
    <div className="text-center">
      <div className="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">{state === "loading" ? <Loader2 className="size-6 animate-spin" /> : <MailCheck className="size-6" />}</div>
      <h1 className="text-2xl font-semibold tracking-tight">{state === "ok" ? "Email verified" : state === "loading" ? "Verifying…" : "Verification failed"}</h1>
      <div className="mt-4">
        {state === "ok" && <FormAlert tone="success">Thanks! Your email address is confirmed.</FormAlert>}
        {state === "error" && <FormAlert>{message}</FormAlert>}
      </div>
      {state !== "loading" && (
        <Button asChild className="mt-6 w-full" size="lg">
          <Link href="/app">Continue to dashboard</Link>
        </Button>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <React.Suspense>
      <Verify />
    </React.Suspense>
  );
}
