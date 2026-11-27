"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Starts Stripe Checkout, or sends an anonymous visitor to sign up first.
 */
export default function SubscribeButton({
  signedIn,
  label = "Subscribe",
  className,
}: {
  signedIn: boolean;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (!signedIn) {
      router.push("/signup?next=/pricing");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/stripe/checkout", { method: "POST" });
      const payload = (await response.json().catch(() => null)) as
        | { url?: string; error?: string }
        | null;

      if (!response.ok || !payload?.url) {
        setError(payload?.error ?? "Could not start checkout. Please try again.");
        setBusy(false);
        return;
      }
      // Leave `busy` set — we are navigating away.
      window.location.href = payload.url;
    } catch {
      setError("Could not reach the server. Please check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className={
          className ??
          "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60"
        }
      >
        {busy ? "Opening Stripe…" : label}
      </button>
      {error && (
        <p role="alert" className="mt-2.5 text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
