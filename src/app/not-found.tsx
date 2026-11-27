import Link from "next/link";
import { SiteHeader } from "@/components/SiteChrome";

export default function NotFound() {
  return (
    <>
      <SiteHeader user={null} />
      <main className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-md flex-col justify-center px-4 text-center">
        <p className="font-mono text-sm text-brand-400">404</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-3 text-slate-400">
          That page does not exist. It may have moved, or the link may be wrong.
        </p>
        <Link
          href="/"
          className="mx-auto mt-8 inline-flex rounded-xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-600"
        >
          Back to the homepage
        </Link>
      </main>
    </>
  );
}
