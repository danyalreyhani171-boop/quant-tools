import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteChrome";
import { getCurrentUser } from "@/lib/auth";
import { runHealthChecks, type Check } from "@/lib/health";

export const metadata: Metadata = {
  title: "Setup",
  robots: { index: false, follow: false },
};

// Always read live configuration, never a cached render.
export const dynamic = "force-dynamic";

const TONE: Record<Check["status"], { ring: string; dot: string; label: string }> = {
  ok: { ring: "border-emerald-500/30 bg-emerald-500/5", dot: "bg-emerald-400", label: "Ready" },
  missing: { ring: "border-amber-500/30 bg-amber-500/5", dot: "bg-amber-400", label: "Not set" },
  broken: { ring: "border-red-500/30 bg-red-500/5", dot: "bg-red-400", label: "Not working" },
};

export default async function SetupPage() {
  const report = await runHealthChecks();
  const user = await getCurrentUser().catch(() => null);

  // Open while the deployment is fresh so you can fix the config before you
  // have an account. Once anyone has signed up, it needs a login — otherwise
  // it would tell strangers which parts of your deployment are broken.
  const isFreshDeployment = report.userCount === 0 || report.userCount === null;
  if (!isFreshDeployment && !user) notFound();

  const remaining = report.checks.filter((c) => c.status !== "ok");

  return (
    <>
      <SiteHeader user={user ? { email: user.email, isSubscribed: user.isSubscribed } : null} />

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Setup</h1>
        <p className="mt-2 text-slate-400">
          {report.allOk
            ? "Everything is configured. Your site is ready to take subscriptions."
            : `${remaining.length} ${remaining.length === 1 ? "thing" : "things"} left to configure. Add each value to your host's environment variables, then redeploy and refresh this page.`}
        </p>

        {report.allOk && (
          <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
            <p className="text-sm font-medium text-emerald-300">You&apos;re live</p>
            <p className="mt-1.5 text-sm text-emerald-100/80">
              Create an account, subscribe with a Stripe test card
              (<code className="font-mono">4242 4242 4242 4242</code>, any future expiry, any CVC)
              and generate something. When that works, swap your Stripe test keys for live keys.
            </p>
            <Link
              href="/signup"
              className="mt-4 inline-block rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-600"
            >
              Create the first account
            </Link>
          </div>
        )}

        <ul className="mt-8 space-y-3">
          {report.checks.map((check) => {
            const tone = TONE[check.status];
            return (
              <li key={check.envVar} className={`rounded-xl border p-5 ${tone.ring}`}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span aria-hidden className={`size-2 shrink-0 rounded-full ${tone.dot}`} />
                  <span className="font-medium text-slate-100">{check.name}</span>
                  <code className="rounded bg-ink-700/70 px-1.5 py-0.5 font-mono text-[11px] text-slate-400">
                    {check.envVar}
                  </code>
                  <span className="ml-auto text-xs text-muted">{tone.label}</span>
                </div>

                <p className="mt-2 text-sm text-slate-400">{check.purpose}</p>

                {check.detail && (
                  <p className="mt-1.5 font-mono text-xs break-words text-ink-500">{check.detail}</p>
                )}

                {check.status !== "ok" && (
                  <p className="mt-3 rounded-lg bg-ink-900/60 p-3 text-sm leading-relaxed text-slate-300">
                    {check.fix}
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        <p className="mt-8 text-xs leading-relaxed text-muted">
          This page shows only whether each setting is present and working — never the values
          themselves. It is open while no account exists so you can fix the configuration on a
          fresh deployment; once someone has signed up it requires a login.
        </p>
      </main>
    </>
  );
}
