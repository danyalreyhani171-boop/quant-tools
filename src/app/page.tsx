import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { PLAN } from "@/lib/stripe";
import { TARGETS, TARGET_IDS } from "@/lib/targets";

const STAGES = [
  {
    name: "Strategy Architect",
    detail:
      "Reads your description and writes a precise spec — every indicator, every condition, every default. Ambiguity gets resolved here, on the record, instead of being guessed at in the code.",
  },
  {
    name: "Risk Engineer",
    detail:
      "Designs the money-management layer: stop loss, take profit and position sizing, as real inputs with real defaults, in the platform's own idioms.",
  },
  {
    name: "Code Writer",
    detail:
      "Writes the complete single file against both specs. No TODOs, no placeholders, every magic number lifted into an input.",
  },
  {
    name: "Debugger",
    detail:
      "Works a twenty-point checklist of the mistakes that actually stop Pine and MQL5 compiling — removed built-ins, conditional `ta.` calls, series/simple type errors, series-index mix-ups.",
  },
  {
    name: "Verifier",
    detail:
      "Independently traces the code bar by bar: cold start, long entry, short entry, stop hit. Checks the arithmetic sign on both sides, because that is the bug that costs money quietly.",
  },
  {
    name: "Finaliser",
    detail:
      "Polishes naming, groups the inputs so the settings panel reads well, and writes your plain-English notes and limitations.",
  },
];

export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <>
      <SiteHeader user={user ? { email: user.email, isSubscribed: user.isSubscribed } : null} />

      <main>
        {/* Hero */}
        <section className="hero-wash relative overflow-hidden border-b border-ink-600/70">
          <div aria-hidden className="grid-lines absolute inset-0" />
          <div className="relative mx-auto max-w-6xl px-4 pt-20 pb-24 sm:px-6 sm:pt-28">
            <div className="mx-auto max-w-3xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-500/25 bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-200">
                <span className="size-1.5 rounded-full bg-brand-400" />
                Six AI agents · Pine Script v6 · MQL5
              </span>

              <h1 className="mt-6 text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-6xl">
                Describe your strategy.
                <br />
                <span className="text-brand-400">Get the code.</span>
              </h1>

              <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">
                Write your trading idea in plain English. Six specialist agents plan it, build the
                risk layer, write it, debug it and verify it — and hand you a finished TradingView
                or MetaTrader 5 file to copy and paste.
              </p>

              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  href={user?.isSubscribed ? "/app" : "/signup"}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-brand-600 sm:w-auto"
                >
                  {user?.isSubscribed ? "Open the generator" : "Start generating"}
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" strokeWidth="2">
                    <path
                      d="M5 12h13M13 6l6 6-6 6"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </Link>
                <Link
                  href="/pricing"
                  className="inline-flex w-full items-center justify-center rounded-xl border border-ink-600 px-6 py-3.5 text-sm font-semibold text-slate-200 transition hover:border-ink-500 hover:bg-ink-800 sm:w-auto"
                >
                  {PLAN.priceLabel}/month — see what&apos;s included
                </Link>
              </div>

              <p className="mt-4 text-xs text-muted">
                Code generation only. No broker connection, no live execution, no backtesting
                engine.
              </p>
            </div>
          </div>
        </section>

        {/* Four outputs */}
        <section className="border-b border-ink-600/70 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-tight">Four outputs, one idea</h2>
              <p className="mt-3 text-slate-400">
                The same description can become a chart indicator or a full algo. Pick the one you
                need and the agents target that platform&apos;s rules specifically.
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {TARGET_IDS.map((id) => {
                const target = TARGETS[id];
                return (
                  <div
                    key={id}
                    className="rounded-xl border border-ink-600 bg-ink-800/50 p-6 transition hover:border-ink-500"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-base font-semibold text-slate-100">{target.label}</h3>
                      <span className="shrink-0 rounded bg-ink-700 px-2 py-0.5 font-mono text-[10px] text-slate-400">
                        {target.languageLabel}
                      </span>
                    </div>
                    <p className="mt-2.5 text-sm leading-relaxed text-muted">{target.tagline}</p>
                    {target.executes && (
                      <span className="mt-3 inline-block rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                        Includes SL / TP / position sizing
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Pipeline */}
        <section className="border-b border-ink-600/70 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-tight">
                Why six agents, not one prompt
              </h2>
              <p className="mt-3 text-slate-400">
                A single model asked for &ldquo;Pine Script for an RSI strategy&rdquo; gives you
                something that looks right and does not compile. Splitting the work means each
                stage has one job and the next one is free to disagree with it.
              </p>
            </div>

            <ol className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {STAGES.map((stage, index) => (
                <li
                  key={stage.name}
                  className="relative rounded-xl border border-ink-600 bg-ink-800/50 p-6"
                >
                  <span className="grid size-8 place-items-center rounded-lg bg-brand-500/15 font-mono text-sm font-bold text-brand-300 ring-1 ring-brand-500/25">
                    {index + 1}
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-slate-100">{stage.name}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{stage.detail}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* What you get */}
        <section className="py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid items-start gap-12 lg:grid-cols-2">
              <div>
                <h2 className="text-3xl font-semibold tracking-tight">
                  Built to paste, not to debug
                </h2>
                <p className="mt-3 text-slate-400">
                  Every generation hands you a complete file, a one-click copy, and a short guide
                  to exactly where it goes in TradingView or MetaEditor.
                </p>
                <ul className="mt-7 space-y-3.5">
                  {[
                    "A complete single file — no fragments to stitch together",
                    "Stop loss, take profit and lot sizing as real, documented inputs",
                    "Syntax-highlighted output with line numbers, copy and download",
                    "A step-by-step paste guide for your exact platform",
                    "Plain-English notes: what it does, what to set first, what it cannot do",
                    "Your full generation history, kept on your account",
                  ].map((item) => (
                    <li key={item} className="flex gap-3">
                      <svg
                        viewBox="0 0 24 24"
                        className="mt-0.5 size-5 shrink-0 text-brand-400"
                        fill="none"
                        strokeWidth="2.5"
                        aria-hidden
                      >
                        <path
                          d="M5 12.5 10 17.5 19 7"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span className="text-sm leading-relaxed text-slate-300">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-ink-600 bg-ink-850 p-6">
                <p className="text-xs font-medium tracking-wide text-muted uppercase">
                  An honest note
                </p>
                <div className="mt-4 space-y-4 text-sm leading-relaxed text-slate-300">
                  <p>
                    DR71Codes writes code. That is the whole product. It does not connect to a
                    broker, place live orders, or run a backtest for you — TradingView&apos;s
                    Strategy Tester and MetaTrader&apos;s own tester already do that better than we
                    could, and they do it on your data.
                  </p>
                  <p>
                    What you get is the part that is genuinely tedious: turning an idea into
                    syntactically correct, properly risk-managed code on the first try instead of
                    the fifteenth.
                  </p>
                  <p>
                    Generated code is a starting point. Read it. Test it. A model that writes a
                    clean file can still misread what you meant, and only you know what you meant.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-16 rounded-2xl border border-brand-500/25 bg-brand-500/5 p-8 text-center sm:p-12">
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                One subscription, unlimited strategies
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-slate-300">
                {PLAN.priceLabel} a month. All four outputs, the full six-agent pipeline, cancel
                whenever you like.
              </p>
              <Link
                href={user ? "/pricing" : "/signup"}
                className="mt-7 inline-flex items-center gap-2 rounded-xl bg-brand-500 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-brand-600"
              >
                Get started
                <svg viewBox="0 0 24 24" className="size-4" fill="none" strokeWidth="2">
                  <path
                    d="M5 12h13M13 6l6 6-6 6"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
