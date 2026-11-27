import { NextResponse } from "next/server";
import { findUserByEmail } from "@/lib/db";
import { isValidEmail, verifyPassword } from "@/lib/password";
import { setSessionCookie } from "@/lib/session";
import { clientKey, rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request, "login"), 15, 15 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many sign-in attempts. Please wait a few minutes and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { email, password } = (body ?? {}) as { email?: unknown; password?: unknown };

  if (typeof email !== "string" || typeof password !== "string" || !isValidEmail(email.trim())) {
    return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
  }

  try {
    const user = await findUserByEmail(email.trim());
    // Always run a verification so a missing account and a wrong password take
    // a similar amount of time.
    const placeholder =
      "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const ok = await verifyPassword(password, user?.password_hash ?? placeholder);

    if (!user || !ok) {
      return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
    }

    await setSessionCookie({ userId: user.id, email: user.email });
    return NextResponse.json({ ok: true, email: user.email });
  } catch (error) {
    console.error("login failed", error);
    return NextResponse.json({ error: "Could not sign you in. Please try again." }, { status: 500 });
  }
}
