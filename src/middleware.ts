import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

/**
 * A cheap first gate: bounce visitors with no session cookie at all before a
 * server component has to touch the database.
 *
 * This is convenience, not security — the cookie's signature is verified and
 * the subscription is checked in `getCurrentUser` / `requireSubscriber`, which
 * is what actually guards the generator.
 */
export function middleware(request: NextRequest) {
  const hasCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  if (hasCookie) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(request.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/app/:path*", "/app", "/account/:path*", "/account"],
};
