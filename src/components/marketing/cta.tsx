import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CtaBanner() {
  return (
    <section className="px-4 py-20 sm:px-6">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-indigo-600 via-violet-600 to-sky-600 px-6 py-14 text-center text-white shadow-xl sm:px-12">
        <div className="bg-grid absolute inset-0 opacity-20" aria-hidden />
        <div className="relative">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Hire your AI marketing team today</h2>
          <p className="mx-auto mt-4 max-w-xl text-[17px] text-white/85">Start free with two AI workers and 100 credits. Upgrade when your team is ready to scale.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="bg-white text-indigo-700 hover:bg-white/90">
              <Link href="/signup">
                Start free <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/10">
              <Link href="/contact?type=SALES">Book a demo</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
