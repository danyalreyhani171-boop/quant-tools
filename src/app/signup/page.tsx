import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { SiteHeader } from "@/components/SiteChrome";
import { getCurrentUser } from "@/lib/auth";
import { PLAN } from "@/lib/stripe";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getCurrentUser();
  const { next } = await searchParams;
  const safeNext = next && /^\/[^/\\]/.test(next) ? next : "/pricing";

  if (user) redirect(safeNext);

  return (
    <>
      <SiteHeader user={null} />
      <main className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-md flex-col justify-center px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Create your account</h1>
        <p className="mt-2 mb-8 text-slate-400">
          Then subscribe for {PLAN.priceLabel}/month to start generating.
        </p>
        <AuthForm mode="signup" next={safeNext} />
      </main>
    </>
  );
}
