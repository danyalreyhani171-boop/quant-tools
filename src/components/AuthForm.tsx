"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface AuthFormProps {
  mode: "login" | "signup";
  /** Where to go after success. */
  next: string;
}

export default function AuthForm({ mode, next }: AuthFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignup = mode === "signup";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/auth/${isSignup ? "signup" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setError(payload?.error ?? "Something went wrong. Please try again.");
        setBusy(false);
        return;
      }

      // A full refresh so server components pick up the new session cookie.
      router.push(next);
      router.refresh();
    } catch {
      setError("Could not reach the server. Please check your connection.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-300">
          Email
        </label>
        <input
          id="email"
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={busy}
          className="w-full rounded-xl border border-ink-600 bg-ink-800 px-4 py-3 text-[15px] text-slate-100 placeholder:text-ink-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 focus:outline-none disabled:opacity-60"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-300">
          Password
        </label>
        <input
          id="password"
          type="password"
          name="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          required
          minLength={isSignup ? 10 : undefined}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={busy}
          className="w-full rounded-xl border border-ink-600 bg-ink-800 px-4 py-3 text-[15px] text-slate-100 placeholder:text-ink-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 focus:outline-none disabled:opacity-60"
          placeholder={isSignup ? "At least 10 characters" : "Your password"}
        />
        {isSignup && (
          <p className="mt-1.5 text-xs text-muted">
            At least 10 characters, with a letter and a number.
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/5 px-3.5 py-2.5 text-sm text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-brand-500 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60"
      >
        {busy
          ? isSignup
            ? "Creating your account…"
            : "Signing you in…"
          : isSignup
            ? "Create account"
            : "Sign in"}
      </button>

      <p className="pt-1 text-center text-sm text-muted">
        {isSignup ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-brand-400 hover:text-brand-300">
              Sign in
            </Link>
          </>
        ) : (
          <>
            No account yet?{" "}
            <Link href="/signup" className="font-medium text-brand-400 hover:text-brand-300">
              Create one
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
