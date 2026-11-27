"use client";

import { useState } from "react";

/** Opens the Stripe Customer Portal for card changes and cancellation. */
export default function ManageBillingButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/stripe/portal", { method: "POST" });
      const payload = (await response.json().catch(() => null)) as
        | { url?: string; error?: string }
        | null;

      if (!response.ok || !payload?.url) {
        setError(payload?.error ?? "Could not open the billing portal.");
        setBusy(false);
        return;
      }
      window.location.href = payload.url;
    } catch {
      setError("Could not reach the server. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={open}
        disabled={busy}
        className="rounded-xl border border-ink-600 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-ink-500 hover:bg-ink-800 disabled:opacity-60"
      >
        {busy ? "Opening…" : "Manage billing"}
      </button>
      {error && (
        <p role="alert" className="mt-2.5 text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
