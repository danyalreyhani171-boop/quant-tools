import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import ManageBillingButton from "@/components/ManageBillingButton";
import SubscribeButton from "@/components/SubscribeButton";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { getCurrentUser } from "@/lib/auth";
import { listGenerations } from "@/lib/db";
import { PLAN } from "@/lib/stripe";
import { isTargetId, TARGETS } from "@/lib/targets";
import { GENERATION_LIMIT } from "@/lib/rateLimit";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false },
};

const STATUS_COPY: Record<string, { label: string; tone: string }> = {
  active: { label: "Active", tone: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" },
  trialing: { label: "Trialing", tone: "bg-brand-500/15 text-brand-300 ring-brand-500/30" },
  past_due: { label: "Past due", tone: "bg-amber-500/15 text-amber-300 ring-amber-500/30" },
  unpaid: { label: "Unpaid", tone: "bg-amber-500/15 text-amber-300 ring-amber-500/30" },
  canceled: { label: "Cancelled", tone: "bg-ink-700 text-slate-400 ring-ink-600" },
  paused: { label: "Paused", tone: "bg-ink-700 text-slate-400 ring-ink-600" },
  incomplete: { label: "Incomplete", tone: "bg-amber-500/15 text-amber-300 ring-amber-500/30" },
  incomplete_expired: { label: "Expired", tone: "bg-ink-700 text-slate-400 ring-ink-600" },
};

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");

  // The history table is best-effort: a database hiccup should not take the
  // whole billing page down with it.
  let history: Awaited<ReturnType<typeof listGenerations>> = [];
  let historyError = false;
  try {
    history = await listGenerations(user.id, 15);
  } catch {
    historyError = true;
  }

  const status = user.subscriptionStatus;
  const badge = status ? STATUS_COPY[status] : undefined;

  return (
    <>
      <SiteHeader user={{ email: user.email, isSubscribed: user.isSubscribed }} />

      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Account</h1>

        {/* Subscription */}
        <section className="mt-8 rounded-xl border border-ink-600 bg-ink-800/50 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-medium tracking-wide text-muted uppercase">
                Subscription
              </h2>
              <p className="mt-2 flex flex-wrap items-center gap-2.5">
                <span className="text-xl font-semibold text-slate-100">{PLAN.name}</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${
                    badge?.tone ?? "bg-ink-700 text-slate-400 ring-ink-600"
                  }`}
                >
                  {badge?.label ?? "No subscription"}
                </span>
              </p>
              <p className="mt-2 text-sm text-slate-400">
                {user.isSubscribed ? (
                  <>
                    {PLAN.priceLabel}/{PLAN.interval}
                    {user.currentPeriodEnd && (
                      <>
                        {" · "}
                        {status === "canceled"
                          ? `access ends ${formatDate(user.currentPeriodEnd)}`
                          : `renews ${formatDate(user.currentPeriodEnd)}`}
                      </>
                    )}
                  </>
                ) : (
                  `Subscribe for ${PLAN.priceLabel}/month to use the generator.`
                )}
              </p>
            </div>

            <div className="shrink-0">
              {user.stripeCustomerId ? <ManageBillingButton /> : null}
            </div>
          </div>

          {!user.isSubscribed && (
            <div className="mt-6 max-w-xs">
              <SubscribeButton signedIn label={`Subscribe — ${PLAN.priceLabel}/month`} />
            </div>
          )}

          {user.needsAttention && (
            <p className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">
              Stripe could not take your last payment. Open the billing portal to update your card
              before access lapses.
            </p>
          )}
        </section>

        {/* Sign-in details */}
        <section className="mt-6 rounded-xl border border-ink-600 bg-ink-800/50 p-6">
          <h2 className="text-sm font-medium tracking-wide text-muted uppercase">Sign-in</h2>
          <p className="mt-2 font-mono text-sm text-slate-200">{user.email}</p>
          <p className="mt-2 text-xs text-muted">
            Fair-use cap: {GENERATION_LIMIT} generations per hour.
          </p>
        </section>

        {/* History */}
        <section className="mt-6">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-100">Recent generations</h2>
            {user.isSubscribed && (
              <Link href="/app" className="text-sm text-brand-400 transition hover:text-brand-300">
                New generation
              </Link>
            )}
          </div>

          {historyError ? (
            <p className="rounded-xl border border-ink-600 bg-ink-800/40 p-6 text-sm text-muted">
              Could not load your history just now. Your subscription is unaffected — try
              refreshing.
            </p>
          ) : history.length === 0 ? (
            <p className="rounded-xl border border-ink-600 bg-ink-800/40 p-6 text-sm text-muted">
              Nothing here yet. Your generations will be listed once you have run one.
            </p>
          ) : (
            <ul className="divide-y divide-ink-700 overflow-hidden rounded-xl border border-ink-600 bg-ink-800/40">
              {history.map((row) => {
                const label = isTargetId(row.target) ? TARGETS[row.target].label : row.target;
                return (
                  <li key={row.id} className="flex flex-wrap items-start gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-slate-200">{label}</span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            row.status === "complete"
                              ? "bg-emerald-500/15 text-emerald-300"
                              : row.status === "failed"
                                ? "bg-red-500/15 text-red-300"
                                : "bg-ink-700 text-slate-400"
                          }`}
                        >
                          {row.status}
                        </span>
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
                        {row.prompt}
                      </p>
                      {row.status === "failed" && row.error && (
                        <p className="mt-1 text-xs text-red-300/80">{row.error}</p>
                      )}
                    </div>
                    <span className="shrink-0 font-mono text-[11px] text-ink-500">
                      {formatDateTime(row.created_at)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
