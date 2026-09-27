import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/app/logo";

export default function NotFound() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center bg-hero-glow px-4 text-center">
      <div>
        <LogoMark className="mx-auto size-12" />
        <p className="mt-6 text-sm font-semibold text-primary">404</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-2 text-muted-foreground">The page you&apos;re looking for doesn&apos;t exist or has moved.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button asChild>
            <Link href="/">Go home</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/app">Open dashboard</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
