import { findUserById, type UserRow } from "@/lib/db";
import { readSession } from "@/lib/session";
import { deriveAccess } from "@/lib/subscription";

/**
 * Who is this request, and are they allowed to generate code?
 *
 * Subscription state is derived here and nowhere else, so there is exactly one
 * definition of "paid" in the codebase.
 */

export interface AuthedUser {
  id: string;
  email: string;
  subscriptionStatus: string | null;
  currentPeriodEnd: Date | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  /** True when this user may use the generator. */
  isSubscribed: boolean;
  /** True when payment failed but the period has not lapsed yet. */
  needsAttention: boolean;
}

/** Maps a database row onto the shape the app uses, applying the access rule. */
export function toAuthedUser(row: UserRow): AuthedUser {
  return {
    id: row.id,
    email: row.email,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    ...deriveAccess(row),
  };
}

/** Returns the signed-in user, or null. Never throws for an anonymous visitor. */
export async function getCurrentUser(): Promise<AuthedUser | null> {
  const session = await readSession();
  if (!session) return null;
  const row = await findUserById(session.userId);
  if (!row) return null;
  return toAuthedUser(row);
}

export class AuthError extends Error {
  readonly status: number;
  readonly code: "unauthenticated" | "unsubscribed";

  constructor(code: "unauthenticated" | "unsubscribed", message: string) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.status = code === "unauthenticated" ? 401 : 402;
  }
}

/** For API routes: the user must be signed in AND subscribed. */
export async function requireSubscriber(): Promise<AuthedUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthError("unauthenticated", "Please sign in to generate code.");
  }
  if (!user.isSubscribed) {
    throw new AuthError(
      "unsubscribed",
      "An active subscription is required to generate code.",
    );
  }
  return user;
}
