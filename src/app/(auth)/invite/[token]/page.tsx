import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { getSession } from "@/server/auth/session";
import { getInviteByToken } from "@/server/services/workspaces";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/auth/form-alert";
import { AcceptInvite } from "./accept-invite";

export const metadata: Metadata = { title: "Workspace invitation", robots: { index: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await getInviteByToken(token);
  if (!invite) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Invitation unavailable</h1>
        <FormAlert className="mt-4">This invitation is invalid, was revoked or has expired. Ask the workspace admin to send a new one.</FormAlert>
        <Button asChild className="mt-6 w-full">
          <Link href="/login">Go to sign in</Link>
        </Button>
      </div>
    );
  }
  const session = await getSession();
  return (
    <div>
      <div className="mb-4 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
        <Users className="size-6" />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Join {invite.workspace.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        You&apos;ve been invited as <strong>{invite.role.name}</strong> ({invite.email}).
      </p>
      <div className="mt-6">
        {session ? (
          session.user.email === invite.email ? (
            <AcceptInvite token={token} />
          ) : (
            <FormAlert>
              You&apos;re signed in as {session.user.email}. Sign out and sign in as {invite.email} to accept.
            </FormAlert>
          )
        ) : (
          <div className="grid gap-2">
            <Button asChild size="lg">
              <Link href={`/signup?invite=${token}&email=${encodeURIComponent(invite.email)}`}>Create account & join</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>I already have an account</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
