import { ensureSchema, query } from "@/lib/db";

/**
 * Configuration self-check for the /setup page.
 *
 * Reports only whether each piece is present and working — never a value, a
 * prefix or a length, so the page cannot leak a secret even if it is left
 * reachable.
 */

export type CheckStatus = "ok" | "missing" | "broken";

export interface Check {
  name: string;
  envVar: string;
  status: CheckStatus;
  /** What this unlocks, in plain English. */
  purpose: string;
  /** Shown when the status is not ok. */
  fix: string;
  detail?: string;
}

function present(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

export interface HealthReport {
  checks: Check[];
  allOk: boolean;
  /** True when no account exists yet, i.e. this is a fresh deployment. */
  firstRun: boolean;
  userCount: number | null;
}

export async function runHealthChecks(): Promise<HealthReport> {
  const checks: Check[] = [];

  // --- Database ---
  let userCount: number | null = null;
  if (!present("DATABASE_URL")) {
    checks.push({
      name: "Database",
      envVar: "DATABASE_URL",
      status: "missing",
      purpose: "Stores accounts, subscription status and generation history.",
      fix: "Create a free Postgres database (Neon is the quickest) and paste its connection string.",
    });
  } else {
    try {
      await ensureSchema();
      const rows = await query<{ count: string }>("SELECT count(*)::text AS count FROM users");
      userCount = Number(rows[0]?.count ?? 0);
      checks.push({
        name: "Database",
        envVar: "DATABASE_URL",
        status: "ok",
        purpose: "Stores accounts, subscription status and generation history.",
        fix: "",
        detail: `Connected. Tables ready. ${userCount} account${userCount === 1 ? "" : "s"}.`,
      });
    } catch (error) {
      checks.push({
        name: "Database",
        envVar: "DATABASE_URL",
        status: "broken",
        purpose: "Stores accounts, subscription status and generation history.",
        fix: "Check the connection string is correct and that the host allows connections from this app. Managed providers usually need ?sslmode=require on the end.",
        detail: error instanceof Error ? error.message.slice(0, 200) : "Unknown error",
      });
    }
  }

  // --- Session signing ---
  const secret = process.env.AUTH_SECRET?.trim() ?? "";
  checks.push(
    secret.length >= 32
      ? {
          name: "Session secret",
          envVar: "AUTH_SECRET",
          status: "ok",
          purpose: "Signs the login cookie.",
          fix: "",
        }
      : {
          name: "Session secret",
          envVar: "AUTH_SECRET",
          status: secret ? "broken" : "missing",
          purpose: "Signs the login cookie.",
          fix: "Set it to at least 32 random characters. Any long random string will do.",
          detail: secret ? "Too short — needs at least 32 characters." : undefined,
        },
  );

  // --- OpenRouter ---
  checks.push(
    present("OPENROUTER_API_KEY")
      ? {
          name: "OpenRouter",
          envVar: "OPENROUTER_API_KEY",
          status: "ok",
          purpose: "Runs the six agents that write your code.",
          fix: "",
          detail: `Model: ${process.env.OPENROUTER_MODEL ?? process.env.OPENROUTER_MODEL_CODING ?? "anthropic/claude-sonnet-4.5 (default)"}`,
        }
      : {
          name: "OpenRouter",
          envVar: "OPENROUTER_API_KEY",
          status: "missing",
          purpose: "Runs the six agents that write your code. Nothing generates without it.",
          fix: "Create a key at openrouter.ai/keys and add credit to the account.",
        },
  );

  // --- Stripe ---
  checks.push(
    present("STRIPE_SECRET_KEY")
      ? {
          name: "Stripe API key",
          envVar: "STRIPE_SECRET_KEY",
          status: "ok",
          purpose: "Takes subscription payments.",
          fix: "",
          detail: process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")
            ? "Test mode — no real money will move."
            : "Live mode.",
        }
      : {
          name: "Stripe API key",
          envVar: "STRIPE_SECRET_KEY",
          status: "missing",
          purpose: "Takes subscription payments. Without it nobody can subscribe.",
          fix: "Copy your secret key from the Stripe dashboard. Start with the test key (sk_test_...).",
        },
  );

  checks.push(
    present("STRIPE_PRICE_ID")
      ? {
          name: "Stripe price",
          envVar: "STRIPE_PRICE_ID",
          status: "ok",
          purpose: "The £17.99/month plan customers subscribe to.",
          fix: "",
        }
      : {
          name: "Stripe price",
          envVar: "STRIPE_PRICE_ID",
          status: "missing",
          purpose: "The £17.99/month plan customers subscribe to.",
          fix: "In Stripe, create a product with a recurring £17.99 monthly price, then paste its id (starts with price_).",
        },
  );

  checks.push(
    present("STRIPE_WEBHOOK_SECRET")
      ? {
          name: "Stripe webhook",
          envVar: "STRIPE_WEBHOOK_SECRET",
          status: "ok",
          purpose: "Tells the app when someone subscribes, renews or cancels.",
          fix: "",
        }
      : {
          name: "Stripe webhook",
          envVar: "STRIPE_WEBHOOK_SECRET",
          status: "missing",
          purpose:
            "Tells the app when someone subscribes. Without it, people can pay and still not get access.",
          fix: "In Stripe → Developers → Webhooks, add an endpoint at /api/stripe/webhook, then paste its signing secret (starts with whsec_).",
        },
  );

  // --- Public URL ---
  // Render and Vercel both advertise their own address, so this is only a
  // problem when neither is set and we would fall back to localhost.
  const autoUrl = process.env.RENDER_EXTERNAL_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL;
  checks.push(
    present("NEXT_PUBLIC_APP_URL") || Boolean(autoUrl)
      ? {
          name: "Public URL",
          envVar: "NEXT_PUBLIC_APP_URL",
          status: "ok",
          purpose: "Where Stripe sends customers back to after paying.",
          fix: "",
          detail: process.env.NEXT_PUBLIC_APP_URL ?? `detected from the host: ${autoUrl}`,
        }
      : {
          name: "Public URL",
          envVar: "NEXT_PUBLIC_APP_URL",
          status: "missing",
          purpose: "Where Stripe sends customers back to after paying.",
          fix: "Set it to this site's full address, with no trailing slash — for example https://dr71codes.onrender.com.",
        },
  );

  return {
    checks,
    allOk: checks.every((c) => c.status === "ok"),
    firstRun: userCount === 0 || userCount === null,
    userCount,
  };
}
