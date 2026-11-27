import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { SiteHeader } from "@/components/SiteChrome";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getCurrentUser();
  const { next } = await searchParams;
  // Only accept same-origin relative paths, so `?next=` cannot be used to
  // bounce a freshly-signed-in user to another site.
  const safeNext = next && /^\/[^/\\]/.test(next) ? next : "/app";

  if (user) redirect(safeNext);

  return (
    <>
      <SiteHeader user={null} />
      <main className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-md flex-col justify-center px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-2 mb-8 text-slate-400">Sign in to generate code.</p>
        <AuthForm mode="login" next={safeNext} />
      </main>
    </>
  );
}
