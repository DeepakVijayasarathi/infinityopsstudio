export function LegalPage({ title, updated, sections }: { title: string; updated: string; sections: { h: string; p: string[] }[] }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-4xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated {updated}</p>
      <nav className="mt-8 rounded-xl border border-border bg-surface p-5" aria-label="Contents">
        <ol className="grid gap-1.5 text-sm sm:grid-cols-2">
          {sections.map((s, i) => (
            <li key={s.h}>
              <a href={`#s${i + 1}`} className="text-muted-foreground hover:text-foreground">
                {i + 1}. {s.h}
              </a>
            </li>
          ))}
        </ol>
      </nav>
      <div className="prose-ios mt-10">
        {sections.map((s, i) => (
          <section key={s.h} id={`s${i + 1}`} className="scroll-mt-20">
            <h2>
              {i + 1}. {s.h}
            </h2>
            {s.p.length > 1 ? (
              <ul>
                {s.p.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            ) : (
              <p>{s.p[0]}</p>
            )}
          </section>
        ))}
      </div>
    </article>
  );
}
