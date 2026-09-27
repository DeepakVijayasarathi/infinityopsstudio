import type { Metadata } from "next";
import { CheckCircle2, MailX } from "lucide-react";
import { db } from "@/server/db";
import { Logo } from "@/components/app/logo";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function UnsubscribePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string }> }) {
  const { token } = await params;
  const { done } = await searchParams;
  const send = await db.emailSend.findUnique({ where: { trackingToken: token }, select: { email: true, workspace: { select: { name: true } } } });
  return (
    <main id="main" className="grid min-h-dvh place-items-center bg-surface px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center card-shadow">
        <div className="flex justify-center">
          <Logo />
        </div>
        {!send || done === "0" ? (
          <>
            <h1 className="mt-8 text-xl font-semibold">Link not recognized</h1>
            <p className="mt-2 text-sm text-muted-foreground">This unsubscribe link is invalid. Reply to the email you received and ask to be removed.</p>
          </>
        ) : done === "1" ? (
          <>
            <CheckCircle2 className="mx-auto mt-8 size-10 text-success" />
            <h1 className="mt-4 text-xl font-semibold">You&apos;re unsubscribed</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {send.email} will no longer receive marketing emails from {send.workspace.name}.
            </p>
          </>
        ) : (
          <form method="post" action={`/api/v1/email/unsubscribe/${token}`}>
            <MailX className="mx-auto mt-8 size-10 text-muted-foreground" />
            <h1 className="mt-4 text-xl font-semibold">Unsubscribe from {send.workspace.name}?</h1>
            <p className="mt-2 text-sm text-muted-foreground">{send.email} will stop receiving marketing emails.</p>
            <input type="hidden" name="confirm" value="1" />
            <Button type="submit" className="mt-6 w-full">
              Unsubscribe
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
