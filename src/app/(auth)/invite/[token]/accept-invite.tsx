"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  async function accept() {
    setBusy(true);
    try {
      await api.post("workspaces/invites/accept", { token });
      toast.success("You've joined the workspace");
      router.push("/app");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Button onClick={accept} loading={busy} size="lg" className="w-full">
      Accept invitation
    </Button>
  );
}
