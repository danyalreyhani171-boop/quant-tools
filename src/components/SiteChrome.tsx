import Link from "next/link";
import LogoutButton from "./LogoutButton";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`group inline-flex items-center gap-2 ${className}`}>
      <span
        aria-hidden
        className="grid size-8 place-items-center rounded-lg bg-brand-500/15 ring-1 ring-brand-500/30"
      >
        <svg viewBox="0 0 24 24" className="size-5 text-brand-400" fill="none" strokeWidth="2">
          <path
            d="M3 17.5 8 11l4 3.5L21 5"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M15 5h6v6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="text-lg font-semibold tracking-tight">
        Quant<span className="text-brand-400">Tools</span>
      </span>
    </Link>
  );
}

export interface HeaderUser {
  email: string;
  isSubscribed: boolean;
}

export function SiteHeader({ user }: { user: HeaderUser | null }) {
  return (
    <header className="sticky top-0 z-30 border-b border-ink-600/70 bg-ink-900/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />

        <nav className="flex items-center gap-1 text-sm sm:gap-2">
          {user ? (
            <>
              <Link
                href="/app"
                className="rounded-lg px-3 py-2 text-slate-300 transition hover:bg-ink-700 hover:text-white"
              >
                Generator
              </Link>
              <Link
                href="/account"
                className="hidden rounded-lg px-3 py-2 text-slate-300 transition hover:bg-ink-700 hover:text-white sm:block"
              >
                Account
              </Link>
              {!user.isSubscribed && (
                <Link
                  href="/pricing"
                  className="rounded-lg bg-brand-500 px-3 py-2 font-medium text-white transition hover:bg-brand-600"
                >
                  Subscribe
                </Link>
              )}
              <LogoutButton />
            </>
          ) : (
            <>
              <Link
                href="/pricing"
                className="rounded-lg px-3 py-2 text-slate-300 transition hover:bg-ink-700 hover:text-white"
              >
                Pricing
              </Link>
              <Link
                href="/login"
                className="rounded-lg px-3 py-2 text-slate-300 transition hover:bg-ink-700 hover:text-white"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-brand-500 px-3.5 py-2 font-medium text-white transition hover:bg-brand-600"
              >
                Get started
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-ink-600/70 bg-ink-950">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-md">
            <Logo />
            <p className="mt-3 text-sm text-muted">
              Plain-English trading strategies turned into TradingView Pine Script v6 and
              MetaTrader 5 MQL5 code.
            </p>
          </div>
          <nav className="flex flex-col gap-2 text-sm text-slate-400">
            <Link href="/pricing" className="transition hover:text-white">
              Pricing
            </Link>
            <Link href="/app" className="transition hover:text-white">
              Generator
            </Link>
            <Link href="/account" className="transition hover:text-white">
              Account
            </Link>
          </nav>
        </div>

        <div className="mt-8 border-t border-ink-700 pt-6 text-xs leading-relaxed text-muted">
          <p className="font-medium text-slate-400">Risk warning</p>
          <p className="mt-1 max-w-3xl">
            Quant Tools generates code. It does not give financial advice, does not execute
            trades, and does not backtest for you. Generated code is a starting point that you
            must read, test and take responsibility for — run it in the TradingView Strategy
            Tester or on a MetaTrader demo account before risking real money. Trading carries
            risk of loss.
          </p>
          <p className="mt-4">© {new Date().getFullYear()} Quant Tools. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
