import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import GeneratorClient from "@/components/GeneratorClient";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import SubscribeButton from "@/components/SubscribeButton";
import { getCurrentUser } from "@/lib/auth";
import { PLAN } from "@/lib/stripe";
import { isTargetId } from "@/lib/targets";

export const metadata: Metadata = {
  title: "Generator",
  description: "Describe your trading strategy and generate Pine Script v6 or MQL5 code.",
  robots: { index: false, follow: false },
};

/** The paywall shown to a signed-in user without an active subscription. */
function Paywall({ status }: { status: string | null }) {
  return (
    <div className="mx-auto max-w-lg py-12 text-center">
      <span
        aria-hidden
        className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-500/15 ring-1 ring-brand-500/25"
      >
        <svg viewBox="0 0 24 24" className="size-7 text-brand-300" fill="none" strokeWidth="2">
          <rect x="4" y="10" width="16" height="11" rx="2" stroke="currentColor" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeLinecap="round" />
        </svg>
      </span>

      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        {status === "canceled" || status === "incomplete_expired"
          ? "Your subscription has ended"
          : "Subscribe to start generating"}
      </h1>
      <p className="mx-auto mt-3 max-w-sm text-slate-400">
        {PLAN.priceLabel} a month for unlimited generations across all four outputs. Cancel any
        time.
      </p>

      {status === "incomplete" && (
        <p className="mx-auto mt-5 max-w-sm rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">
          Your last payment did not complete. Subscribing again will take you back to Stripe to
          finish it.
        </p>
      )}

      <div className="mx-auto mt-8 max-w-xs">
        <SubscribeButton signedIn label={`Subscribe — ${PLAN.priceLabel}/month`} />
      </div>

      <Link
        href="/pricing"
        className="mt-5 inline-block text-sm text-brand-400 transition hover:text-brand-300"
      >
        See everything that is included
      </Link>
    </div>
  );
}

export default async function GeneratorPage({
  searchParams,
}: {
  searchParams: Promise<{ target?: string; checkout?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/app");

  const { target, checkout } = await searchParams;
  const initialTarget = isTargetId(target) ? target : undefined;

  return (
    <>
      <SiteHeader user={{ email: user.email, isSubscribed: user.isSubscribed }} />

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        {!user.isSubscribed ? (
          <Paywall status={user.subscriptionStatus} />
        ) : (
          <>
            {checkout === "success" && (
              <div className="mb-8 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                <p className="text-sm font-medium text-emerald-300">You&apos;re subscribed</p>
                <p className="mt-1 text-sm text-emerald-100/80">
                  Thanks. Describe your first strategy below — it takes a couple of minutes to
                  build.
                </p>
              </div>
            )}

            {user.needsAttention && (
              <div className="mb-8 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                <p className="text-sm font-medium text-amber-200">Payment needs attention</p>
                <p className="mt-1 text-sm text-amber-100/80">
                  Stripe could not take your last payment. You still have access for now —{" "}
                  <Link href="/account" className="font-medium underline">
                    update your card
                  </Link>{" "}
                  to keep it.
                </p>
              </div>
            )}

            <div className="mb-10">
              <h1 className="text-3xl font-semibold tracking-tight">Strategy to code</h1>
              <p className="mt-2 text-slate-400">
                Describe what you want, pick your platform, and the six agents will build it.
              </p>
            </div>

            <GeneratorClient initialTarget={initialTarget} />
          </>
        )}
      </main>

      <SiteFooter />
    </>
  );
}
