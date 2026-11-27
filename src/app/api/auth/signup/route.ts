import { NextResponse } from "next/server";
import { createUser, findUserByEmail } from "@/lib/db";
import { checkPasswordStrength, hashPassword, isValidEmail } from "@/lib/password";
import { setSessionCookie } from "@/lib/session";
import { clientKey, rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request, "signup"), 10, 15 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many sign-up attempts. Please wait a few minutes and try again." },
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

  if (typeof email !== "string" || !isValidEmail(email.trim())) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  if (typeof password !== "string") {
    return NextResponse.json({ error: "Please choose a password." }, { status: 400 });
  }

  const strength = checkPasswordStrength(password);
  if (!strength.ok) {
    return NextResponse.json({ error: strength.message }, { status: 400 });
  }

  try {
    const existing = await findUserByEmail(email.trim());
    if (existing) {
      return NextResponse.json(
        { error: "An account with that email already exists. Try signing in instead." },
        { status: 409 },
      );
    }

    const user = await createUser(email.trim(), await hashPassword(password));
    await setSessionCookie({ userId: user.id, email: user.email });

    return NextResponse.json({ ok: true, email: user.email });
  } catch (error) {
    // A unique-constraint race means someone signed up in the gap above.
    if (error instanceof Error && /duplicate key|unique constraint/i.test(error.message)) {
      return NextResponse.json(
        { error: "An account with that email already exists. Try signing in instead." },
        { status: 409 },
      );
    }
    console.error("signup failed", error);
    return NextResponse.json(
      { error: "Could not create your account. Please try again." },
      { status: 500 },
    );
  }
}
