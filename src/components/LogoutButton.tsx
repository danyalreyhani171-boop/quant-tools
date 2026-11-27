"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      startTransition(() => {
        router.push("/");
        router.refresh();
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy || pending}
      className="rounded-lg px-3 py-2 text-slate-400 transition hover:bg-ink-700 hover:text-white disabled:opacity-50"
    >
      {busy || pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
