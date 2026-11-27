import Stripe from "stripe";

/**
 * Stripe client and the one place the plan's shape is described.
 *
 * The client is created lazily so that `next build` does not need secrets, and
 * a missing key surfaces as a clear runtime error on the route that needs it.
 */

declare global {
  var __dr71Stripe: Stripe | undefined;
}

export const PLAN = {
  priceLabel: "£17.99",
  interval: "month",
  currency: "GBP",
  name: "DR71Codes Pro",
  features: [
    "Unlimited strategy generations",
    "All four outputs: Pine Script indicator & strategy, MQL5 indicator & EA",
    "Six-agent pipeline: plan, risk, write, debug, verify, polish",
    "Automatic stop loss, take profit and position-sizing inputs",
    "One-click copy, plus a paste guide for each platform",
    "Your full generation history",
    "Cancel any time",
  ],
} as const;

export function getStripe(): Stripe {
  if (!globalThis.__dr71Stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY is not set. Add it to your environment and restart.");
    }
    globalThis.__dr71Stripe = new Stripe(key, {
      // Pin the API version so a Stripe-side upgrade cannot change behaviour
      // underneath a running deployment.
      apiVersion: "2026-11-18.endive",
      typescript: true,
      appInfo: { name: "DR71Codes", version: "1.0.0" },
    });
  }
  return globalThis.__dr71Stripe;
}

export function getPriceId(): string {
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    throw new Error(
      "STRIPE_PRICE_ID is not set. Create a £17.99/month recurring price in Stripe and put its id (price_...) in your environment.",
    );
  }
  return priceId;
}

/**
 * Absolute base URL for Stripe redirect targets.
 *
 * Falls back to the address the host advertises, so a deploy on Render or
 * Vercel works before anyone has set NEXT_PUBLIC_APP_URL by hand.
 */
export function getBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  // Render
  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, "");
  }
  // Vercel
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/**
 * Stripe moved the period window from the subscription to its items. Read the
 * item window when it is there and fall back to the legacy top-level field, so
 * this keeps working across API versions.
 */
export function readPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const fromItem = subscription.items?.data?.[0]?.current_period_end;
  const legacy = (subscription as unknown as { current_period_end?: number })
    .current_period_end;
  const seconds = fromItem ?? legacy;
  return typeof seconds === "number" ? new Date(seconds * 1000) : null;
}

export function readSubscriptionCustomerId(subscription: Stripe.Subscription): string | null {
  const customer = subscription.customer;
  if (typeof customer === "string") return customer;
  if (customer && typeof customer === "object" && "id" in customer) return customer.id;
  return null;
}
