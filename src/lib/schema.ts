/**
 * The database schema, and the single source of truth for it.
 *
 * It lives in TypeScript rather than a .sql file so that it is bundled with
 * the app on serverless hosts, where reading a file from disk at runtime is
 * not dependable. `ensureSchema()` applies it on first use, which is what
 * makes a deploy work without anyone opening a terminal.
 *
 * Every statement must be idempotent — this runs on every cold start.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id                     TEXT PRIMARY KEY,
  email                  TEXT NOT NULL UNIQUE,
  password_hash          TEXT NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  stripe_customer_id     TEXT UNIQUE,
  stripe_subscription_id TEXT,
  -- Mirrors the Stripe subscription status: active, trialing, past_due,
  -- canceled, incomplete, incomplete_expired, unpaid, paused, or NULL.
  subscription_status    TEXT,
  -- End of the paid period. Access continues until this moment even after a
  -- cancellation, which is what the customer paid for.
  current_period_end     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS users_stripe_customer_idx ON users (stripe_customer_id);
CREATE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));

-- One row per generation run, for the user's history and for rate limiting.
CREATE TABLE IF NOT EXISTS generations (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  target       TEXT NOT NULL,
  prompt       TEXT NOT NULL,
  code         TEXT,
  notes        JSONB,
  warnings     JSONB,
  status       TEXT NOT NULL DEFAULT 'running',
  total_tokens INTEGER NOT NULL DEFAULT 0,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS generations_user_created_idx
  ON generations (user_id, created_at DESC);

-- Stripe event ids already handled, so a redelivered webhook is a no-op.
CREATE TABLE IF NOT EXISTS stripe_events (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

/**
 * Arbitrary but fixed key for the Postgres advisory lock held while the schema
 * is applied, so two instances booting at once cannot race.
 */
export const SCHEMA_LOCK_KEY = 8_273_411_907_552_119n;
