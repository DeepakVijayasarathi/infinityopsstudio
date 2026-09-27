import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";

export const metadata = { title: "Access restricted" };

export default function Forbidden() {
  return (
    <EmptyState
      icon={ShieldAlert}
      title="You don't have access to this area"
      description="Your role in this workspace doesn't include this permission. Ask a workspace admin to change your role."
      action={
        <Button asChild>
          <Link href="/app">Back to overview</Link>
        </Button>
      }
    />
  );
}
