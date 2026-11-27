import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { setStripeCustomerId } from "@/lib/db";
import { getBaseUrl, getPriceId, getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

/** Starts a Stripe Checkout session for the £17.99/month plan. */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  }
  if (user.isSubscribed) {
    return NextResponse.json(
      { error: "You already have an active subscription." },
      { status: 409 },
    );
  }

  try {
    const stripe = getStripe();
    const baseUrl = getBaseUrl();

    // Reuse the customer so a resubscribe lands on the same billing record.
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await setStripeCustomerId(user.id, customerId);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: getPriceId(), quantity: 1 }],
      // The webhook is the source of truth, but the ids are carried here too
      // so a Checkout record is always traceable back to a user.
      client_reference_id: user.id,
      subscription_data: { metadata: { userId: user.id } },
      metadata: { userId: user.id },
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      automatic_tax: { enabled: true },
      customer_update: { address: "auto", name: "auto" },
      success_url: `${baseUrl}/app?checkout=success`,
      cancel_url: `${baseUrl}/pricing?checkout=cancelled`,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe did not return a checkout URL. Please try again." },
        { status: 502 },
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("checkout failed", error);
    const message =
      error instanceof Error ? error.message : "Could not start checkout. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
