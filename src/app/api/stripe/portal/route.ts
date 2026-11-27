import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getBaseUrl, getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

/** Opens the Stripe Customer Portal so the user can change card or cancel. */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  }
  if (!user.stripeCustomerId) {
    return NextResponse.json(
      { error: "You do not have a billing record yet. Subscribe first." },
      { status: 409 },
    );
  }

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${getBaseUrl()}/account`,
    });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("portal failed", error);
    const message =
      error instanceof Error
        ? error.message
        : "Could not open the billing portal. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
