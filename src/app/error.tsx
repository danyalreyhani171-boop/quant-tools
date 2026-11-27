"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="mt-3 text-slate-400">
        An unexpected error stopped this page loading. Trying again often fixes it.
      </p>
      {error.digest && (
        <p className="mt-3 font-mono text-xs text-ink-500">Reference: {error.digest}</p>
      )}
      <button
        type="button"
        onClick={reset}
        className="mx-auto mt-8 rounded-xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-600"
      >
        Try again
      </button>
    </main>
  );
}
