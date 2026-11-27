import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import SubscribeButton from "@/components/SubscribeButton";
import ManageBillingButton from "@/components/ManageBillingButton";
import { PLAN } from "@/lib/stripe";

export const metadata: Metadata = {
  title: "Pricing",
  description: `Quant Tools Pro — ${PLAN.priceLabel} a month for unlimited Pine Script and MQL5 generation.`,
};

const FAQ = [
  {
    q: "What exactly do I get?",
    a: "Unlimited strategy generations across all four outputs: a TradingView Pine Script v6 indicator, a Pine Script v6 strategy, a MetaTrader 5 MQL5 indicator, and an MQL5 Expert Advisor. Every generation runs the full six-agent pipeline and gives you a complete file, a copy button and a paste guide.",
  },
  {
    q: "Does it place trades for me?",
    a: "No. Quant Tools generates code and nothing else. There is no broker connection and no live execution anywhere in the product. The MQL5 Expert Advisor and Pine strategy you generate can place orders once you install them yourself, on your own platform, under your own control.",
  },
  {
    q: "Does it backtest?",
    a: "No, and on purpose. TradingView's Strategy Tester and MetaTrader's own tester already backtest properly, on your instrument and your data. We generate code that works in them.",
  },
  {
    q: "Will the code compile first time?",
    a: "Usually. The debugger and verifier stages exist specifically to catch the errors that stop Pine and MQL5 compiling, and we check the output for unbalanced brackets, missing declarations and removed built-ins before showing it to you. It is still generated code — read it, compile it, and tell us when something slips through.",
  },
  {
    q: "Can I cancel?",
    a: "Any time, from your account page, which opens the Stripe billing portal. You keep access until the end of the period you have already paid for.",
  },
  {
    q: "Is there a usage cap?",
    a: "There is a fair-use cap of 30 generations per hour, which exists to keep model costs predictable. In normal use you will never meet it.",
  },
];

export default async function PricingPage() {
  const user = await getCurrentUser();

  return (
    <>
      <SiteHeader user={user ? { email: user.email, isSubscribed: user.isSubscribed } : null} />

      <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            One plan. Everything in it.
          </h1>
          <p className="mt-4 text-lg text-slate-400">
            No tiers, no per-generation credits, no upsells.
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-lg">
          <div className="relative overflow-hidden rounded-2xl border border-brand-500/35 bg-ink-800/60 p-8">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 -top-24 h-48 bg-[radial-gradient(40rem_12rem_at_50%_100%,rgba(79,140,255,0.18),transparent)]"
            />
            <div className="relative">
              <p className="text-sm font-medium text-brand-300">{PLAN.name}</p>
              <p className="mt-3 flex items-baseline gap-1.5">
                <span className="text-5xl font-semibold tracking-tight">{PLAN.priceLabel}</span>
                <span className="text-slate-400">/{PLAN.interval}</span>
              </p>
              <p className="mt-2 text-sm text-muted">
                Billed monthly in {PLAN.currency}. Cancel any time.
              </p>

              <ul className="mt-7 space-y-3">
                {PLAN.features.map((feature) => (
                  <li key={feature} className="flex gap-3">
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
                    <span className="text-sm leading-relaxed text-slate-300">{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8">
                {user?.isSubscribed ? (
                  <div className="space-y-3">
                    <Link
                      href="/app"
                      className="inline-flex w-full items-center justify-center rounded-xl bg-brand-500 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-brand-600"
                    >
                      Open the generator
                    </Link>
                    <ManageBillingButton />
                  </div>
                ) : (
                  <SubscribeButton
                    signedIn={Boolean(user)}
                    label={user ? `Subscribe — ${PLAN.priceLabel}/month` : "Create an account"}
                  />
                )}
              </div>

              <p className="mt-4 text-center text-xs text-muted">
                Secure payment handled by Stripe. We never see your card details.
              </p>
            </div>
          </div>
        </div>

        <section className="mx-auto mt-20 max-w-3xl">
          <h2 className="text-2xl font-semibold tracking-tight">Questions</h2>
          <dl className="mt-8 space-y-6">
            {FAQ.map((item) => (
              <div key={item.q} className="rounded-xl border border-ink-600 bg-ink-800/40 p-5">
                <dt className="text-sm font-semibold text-slate-100">{item.q}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-slate-400">{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
