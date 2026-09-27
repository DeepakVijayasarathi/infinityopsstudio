"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <ErrorState
      title="This page failed to load"
      description={`An unexpected error occurred${error.digest ? ` (ref ${error.digest})` : ""}. Try again, and contact support if it keeps happening.`}
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
