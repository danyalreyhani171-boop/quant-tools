import type { Target } from "@/lib/targets";

/** The "Where to Paste This" guide shown under every generated file. */
export default function PasteGuide({ target }: { target: Target }) {
  return (
    <section className="rounded-xl border border-ink-600 bg-ink-800/50 p-5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-brand-500/15 ring-1 ring-brand-500/25"
        >
          <svg viewBox="0 0 24 24" className="size-4.5 text-brand-300" fill="none" strokeWidth="2">
            <path
              d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"
              stroke="currentColor"
              strokeLinecap="round"
            />
            <rect x="9" y="3" width="6" height="4" rx="1" stroke="currentColor" />
          </svg>
        </span>
        <div>
          <h3 className="text-base font-semibold text-slate-100">{target.pasteGuide.heading}</h3>
          <p className="mt-0.5 text-sm text-muted">
            Five minutes, no coding needed. Copy the file above, then follow these steps.
          </p>
        </div>
      </div>

      <ol className="mt-5 space-y-3.5">
        {target.pasteGuide.steps.map((step, index) => (
          <li key={step.title} className="flex gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-md bg-ink-700 font-mono text-xs font-semibold text-brand-300 ring-1 ring-ink-600">
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-200">{step.title}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-muted">{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-5 flex gap-2.5 rounded-lg border border-brand-500/20 bg-brand-500/5 p-3 text-xs leading-relaxed text-brand-200/90">
        <svg
          viewBox="0 0 24 24"
          className="mt-px size-4 shrink-0"
          fill="none"
          strokeWidth="2"
          aria-hidden
        >
          <circle cx="12" cy="12" r="9" stroke="currentColor" />
          <path d="M12 11v5M12 8h.01" stroke="currentColor" strokeLinecap="round" />
        </svg>
        <span>{target.pasteGuide.note}</span>
      </p>
    </section>
  );
}
