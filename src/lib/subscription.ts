/**
 * The single definition of "this user may generate code".
 *
 * Kept in its own module, free of database and framework imports, so the rule
 * can be tested directly and so there is exactly one place where access is
 * decided.
 */

/** The subset of the users row this decision depends on. */
export interface SubscriptionFields {
  subscription_status: string | null;
  current_period_end: Date | null;
}

export interface Access {
  subscriptionStatus: string | null;
  currentPeriodEnd: Date | null;
  /** True when this user may use the generator. */
  isSubscribed: boolean;
  /** True when payment is failing but access has not lapsed yet. */
  needsAttention: boolean;
}

/** Stripe statuses that grant access outright. */
const ACTIVE_STATUSES = new Set(["active", "trialing"]);

/**
 * Stripe statuses where payment is failing. Access continues until the paid
 * period runs out, which is Stripe's own retry window.
 */
const GRACE_STATUSES = new Set(["past_due", "unpaid"]);

/** Statuses that keep access only while the paid period has not expired. */
const UNTIL_PERIOD_END = new Set(["canceled", "past_due", "unpaid", "paused"]);

export function deriveAccess(row: SubscriptionFields, now: number = Date.now()): Access {
  const status = row.subscription_status;
  const periodEnd = row.current_period_end;
  const periodStillValid = periodEnd instanceof Date && periodEnd.getTime() > now;

  const isSubscribed =
    status !== null &&
    (ACTIVE_STATUSES.has(status) || (UNTIL_PERIOD_END.has(status) && periodStillValid));

  return {
    subscriptionStatus: status,
    currentPeriodEnd: periodEnd,
    isSubscribed,
    needsAttention: status !== null && GRACE_STATUSES.has(status),
  };
}
