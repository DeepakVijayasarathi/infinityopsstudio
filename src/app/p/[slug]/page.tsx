import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { publicPage } from "@/server/services/landing-pages";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> };

async function load({ params, searchParams }: Props) {
  const [{ slug }, { preview }] = await Promise.all([params, searchParams]);
  let memberOf: string[] = [];
  if (preview) {
    const session = await getSession();
    if (session) memberOf = (await db.workspaceMember.findMany({ where: { userId: session.user.id }, select: { workspaceId: true } })).map((m) => m.workspaceId);
  }
  return publicPage(slug, memberOf);
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const page = await load(props);
  if (!page) return { title: "Page not found" };
  return {
    title: { absolute: page.seoTitle || page.title },
    description: page.seoDescription ?? undefined,
    robots: page.status === "PUBLISHED" ? undefined : { index: false, follow: false },
    openGraph: { title: page.seoTitle || page.title, description: page.seoDescription ?? undefined },
  };
}

const FIELD: Record<string, { label: string; type: string; required?: boolean; autoComplete: string }> = {
  name: { label: "Your name", type: "text", required: true, autoComplete: "name" },
  email: { label: "Work email", type: "email", required: true, autoComplete: "email" },
  company: { label: "Company", type: "text", autoComplete: "organization" },
  phone: { label: "Phone", type: "tel", autoComplete: "tel" },
  message: { label: "How can we help?", type: "textarea", autoComplete: "off" },
};

export default async function LandingPage(props: Props) {
  const page = await load(props);
  if (!page) notFound();
  const c = page.content;
  const live = page.status === "PUBLISHED" && !!page.widgetKey;
  const fields = c.form.fields.includes("email") ? c.form.fields : ["email", ...c.form.fields];
  const accent = { "--lp-accent": page.accentColor } as CSSProperties;
  const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-[15px] text-slate-900 outline-none focus:border-[var(--lp-accent)] focus:ring-2 focus:ring-[var(--lp-accent)]/25";

  return (
    <div style={accent} className="min-h-dvh bg-white text-slate-900 [color-scheme:light]">
      {page.status !== "PUBLISHED" && <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">Preview — this page is a draft and isn&apos;t public yet.</div>}
      <header className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {page.logoUrl ? <img src={page.logoUrl} alt={page.company} className="h-8 w-auto" /> : <span className="text-lg font-bold">{page.company}</span>}
        <a href="#get-started" className="ml-auto rounded-lg bg-[var(--lp-accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
          {c.hero.cta}
        </a>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-8 md:grid-cols-[1.15fr_1fr] md:pt-14">
          <div>
            {c.hero.eyebrow && <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--lp-accent)]">{c.hero.eyebrow}</p>}
            <h1 className="text-balance text-4xl font-bold leading-tight tracking-tight sm:text-5xl">{c.hero.headline}</h1>
            {c.hero.subheadline && <p className="mt-5 text-pretty text-lg leading-relaxed text-slate-600">{c.hero.subheadline}</p>}
            {c.proof.stat && (
              <p className="mt-8 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-[var(--lp-accent)]">{c.proof.stat}</span>
                <span className="text-sm text-slate-600">{c.proof.statLabel}</span>
              </p>
            )}
          </div>

          <div id="get-started" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60">
            <h2 className="mb-4 text-xl font-semibold">{c.form.title}</h2>
            <form data-infinityops="" data-page={page.id} data-success={c.form.success} className="space-y-3">
              {fields.map((f) => {
                const d = FIELD[f]!;
                return (
                  <label key={f} className="block text-sm font-medium text-slate-700">
                    {d.label}
                    {d.type === "textarea" ? (
                      <textarea name={f} rows={3} className={`${input} mt-1`} />
                    ) : (
                      <input name={f} type={d.type} required={d.required} autoComplete={d.autoComplete} className={`${input} mt-1`} />
                    )}
                  </label>
                );
              })}
              <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
              <button type="submit" disabled={!live} className="w-full rounded-lg bg-[var(--lp-accent)] px-4 py-3 font-semibold text-white hover:opacity-90 disabled:opacity-60">
                {c.form.button}
              </button>
              {!live && <p className="text-xs text-slate-500">{page.status === "PUBLISHED" ? "The form is offline because the website widget is turned off." : "The form works once the page is published."}</p>}
              <p className="text-xs text-slate-500">We&apos;ll only use your details to reply to you.</p>
            </form>
          </div>
        </section>

        {c.benefits.length > 0 && (
          <section className="bg-slate-50 py-16">
            <div className="mx-auto grid max-w-6xl gap-6 px-5 md:grid-cols-3">
              {c.benefits.map((b, i) => (
                <div key={i} className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                  <div className="mb-3 size-2 rounded-full bg-[var(--lp-accent)]" />
                  <h3 className="font-semibold">{b.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{b.body}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {c.steps.length > 0 && (
          <section className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="mb-8 text-center text-2xl font-bold">How it works</h2>
            <ol className="grid gap-6 md:grid-cols-3">
              {c.steps.map((s, i) => (
                <li key={i} className="flex gap-4">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--lp-accent)] font-semibold text-white">{i + 1}</span>
                  <span>
                    <span className="block font-semibold">{s.title}</span>
                    <span className="mt-1 block text-[15px] text-slate-600">{s.body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {c.proof.quote && (
          <section className="mx-auto max-w-3xl px-5 py-12 text-center">
            <blockquote className="text-pretty text-xl font-medium leading-relaxed">“{c.proof.quote}”</blockquote>
            {c.proof.author && <p className="mt-4 text-sm text-slate-600">— {c.proof.author}</p>}
          </section>
        )}

        {c.faq.length > 0 && (
          <section className="mx-auto max-w-3xl px-5 py-16">
            <h2 className="mb-6 text-center text-2xl font-bold">Questions</h2>
            <div className="divide-y divide-slate-200 rounded-xl ring-1 ring-slate-200">
              {c.faq.map((f, i) => (
                <details key={i} className="group p-5">
                  <summary className="cursor-pointer list-none font-medium marker:hidden">
                    <span className="mr-2 inline-block text-[var(--lp-accent)] transition-transform group-open:rotate-45">+</span>
                    {f.q}
                  </summary>
                  <p className="mt-3 text-[15px] leading-relaxed text-slate-600">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        )}

        {c.closing.headline && (
          <section className="bg-slate-900 py-16 text-center text-white">
            <div className="mx-auto max-w-3xl px-5">
              <h2 className="text-balance text-3xl font-bold">{c.closing.headline}</h2>
              {c.closing.body && <p className="mt-3 text-slate-300">{c.closing.body}</p>}
              <a href="#get-started" className="mt-7 inline-block rounded-lg bg-[var(--lp-accent)] px-6 py-3 font-semibold text-white hover:opacity-90">
                {c.hero.cta}
              </a>
            </div>
          </section>
        )}
      </main>

      <footer className="px-5 py-8 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} {page.company} · Built with InfinityOps Studio
      </footer>
      {live && <script src="/widget.js" data-key={page.widgetKey!} data-page={page.id} defer />}
    </div>
  );
}
