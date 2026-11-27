import type Stripe from "stripe";
import {
  findUserById,
  findUserByStripeCustomerId,
  markStripeEventProcessed,
  setStripeCustomerId,
  updateSubscription,
  type UserRow,
} from "@/lib/db";
import { getStripe, readPeriodEnd, readSubscriptionCustomerId } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * Stripe webhook — the single source of truth for subscription state.
 *
 * Nothing else in the app writes `subscription_status`, so the database can
 * never disagree with Stripe for longer than it takes a webhook to arrive.
 */

const RELEVANT_EVENTS = new Set<Stripe.Event["type"]>([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.payment_failed",
  "invoice.paid",
]);

/** Finds the local user a Stripe object belongs to, by metadata then by customer id. */
async function resolveUser(
  metadataUserId: string | undefined,
  customerId: string | null,
): Promise<UserRow | null> {
  if (metadataUserId) {
    const byId = await findUserById(metadataUserId);
    if (byId) {
      // Backfill the customer link if Checkout created the customer.
      if (customerId && byId.stripe_customer_id !== customerId) {
        await setStripeCustomerId(byId.id, customerId);
      }
      return byId;
    }
  }
  if (customerId) return findUserByStripeCustomerId(customerId);
  return null;
}

async function applySubscription(
  subscription: Stripe.Subscription,
  metadataUserId?: string,
): Promise<void> {
  const customerId = readSubscriptionCustomerId(subscription);
  const user = await resolveUser(
    metadataUserId ?? subscription.metadata?.userId ?? undefined,
    customerId,
  );

  if (!user) {
    console.warn("stripe webhook: no local user for subscription", subscription.id);
    return;
  }

  // `cancel_at_period_end` keeps the status "active" in Stripe, but the user
  // has cancelled. Record it as canceled so the UI can say so, while
  // `current_period_end` keeps their access until the paid period runs out.
  const status =
    subscription.status === "active" && subscription.cancel_at_period_end
      ? "canceled"
      : subscription.status;

  await updateSubscription(user.id, {
    stripeSubscriptionId: subscription.id,
    status,
    currentPeriodEnd: readPeriodEnd(subscription),
  });
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return new Response("Webhook secret not configured", { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  // Signature verification needs the exact raw bytes, so read text, not json.
  const payload = await request.text();

  let event: Stripe.Event;
  const stripe = getStripe();
  try {
    event = await stripe.webhooks.constructEventAsync(payload, signature, secret);
  } catch (error) {
    console.error("stripe signature verification failed", error);
    return new Response("Invalid signature", { status: 400 });
  }

  if (!RELEVANT_EVENTS.has(event.type)) {
    return Response.json({ received: true, ignored: event.type });
  }

  // Stripe retries on any non-2xx, so handling must be idempotent.
  try {
    const isNew = await markStripeEventProcessed(event.id, event.type);
    if (!isNew) {
      return Response.json({ received: true, duplicate: true });
    }
  } catch (error) {
    console.error("could not record stripe event", error);
    return new Response("Database unavailable", { status: 500 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        if (!subscriptionId) break;

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await applySubscription(
          subscription,
          session.client_reference_id ?? session.metadata?.userId ?? undefined,
        );
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed": {
        await applySubscription(event.data.object);
        break;
      }

      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        // Invoice -> subscription moved into `parent` in recent API versions;
        // read both shapes so this works either way.
        const parent = (
          invoice as unknown as {
            parent?: { subscription_details?: { subscription?: string | { id: string } } };
            subscription?: string | { id: string };
          }
        );
        const ref = parent.parent?.subscription_details?.subscription ?? parent.subscription;
        const subscriptionId = typeof ref === "string" ? ref : ref?.id;
        if (!subscriptionId) break;

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await applySubscription(subscription);
        break;
      }
    }

    return Response.json({ received: true });
  } catch (error) {
    // Returning 500 asks Stripe to retry, which is what we want for a
    // transient database or API failure.
    console.error(`stripe webhook ${event.type} failed`, error);
    return new Response("Webhook handler failed", { status: 500 });
  }
}
