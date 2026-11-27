import { Pool, type QueryResultRow } from "pg";

/**
 * A single pooled Postgres connection, cached on `globalThis` so Next's dev
 * server does not open a new pool on every hot reload.
 */

declare global {
  var __quantToolsPool: Pool | undefined;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Add it to your environment and restart.");
  }

  // Managed Postgres (Neon, Supabase, Heroku) terminates TLS with a cert the
  // Node bundle does not trust by default. Opt in explicitly rather than
  // globally disabling verification.
  const needsSsl =
    /\bsslmode=require\b/.test(connectionString) ||
    process.env.DATABASE_SSL === "true" ||
    (process.env.NODE_ENV === "production" && process.env.DATABASE_SSL !== "false");

  return new Pool({
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

export function getPool(): Pool {
  if (!globalThis.__quantToolsPool) {
    globalThis.__quantToolsPool = createPool();
  }
  return globalThis.__quantToolsPool;
}

export async function query<T extends QueryResultRow>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(sql, params as unknown[]);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------- users

export interface UserRow extends QueryResultRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: Date;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  current_period_end: Date | null;
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  return queryOne<UserRow>("SELECT * FROM users WHERE lower(email) = lower($1)", [email]);
}

export async function findUserById(id: string): Promise<UserRow | null> {
  return queryOne<UserRow>("SELECT * FROM users WHERE id = $1", [id]);
}

export async function findUserByStripeCustomerId(customerId: string): Promise<UserRow | null> {
  return queryOne<UserRow>("SELECT * FROM users WHERE stripe_customer_id = $1", [customerId]);
}

export async function createUser(
  email: string,
  passwordHash: string,
): Promise<UserRow> {
  const row = await queryOne<UserRow>(
    `INSERT INTO users (id, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [crypto.randomUUID(), email.trim().toLowerCase(), passwordHash],
  );
  if (!row) throw new Error("Could not create the account.");
  return row;
}

export async function setStripeCustomerId(userId: string, customerId: string): Promise<void> {
  await query("UPDATE users SET stripe_customer_id = $2 WHERE id = $1", [userId, customerId]);
}

export async function updateSubscription(
  userId: string,
  fields: {
    stripeSubscriptionId: string | null;
    status: string | null;
    currentPeriodEnd: Date | null;
  },
): Promise<void> {
  await query(
    `UPDATE users
        SET stripe_subscription_id = $2,
            subscription_status    = $3,
            current_period_end     = $4
      WHERE id = $1`,
    [userId, fields.stripeSubscriptionId, fields.status, fields.currentPeriodEnd],
  );
}

// ---------------------------------------------------- generation history

export interface GenerationRow extends QueryResultRow {
  id: string;
  user_id: string;
  target: string;
  prompt: string;
  code: string | null;
  status: string;
  total_tokens: number;
  error: string | null;
  created_at: Date;
  finished_at: Date | null;
}

export async function startGeneration(
  id: string,
  userId: string,
  target: string,
  prompt: string,
): Promise<void> {
  await query(
    `INSERT INTO generations (id, user_id, target, prompt, status)
     VALUES ($1, $2, $3, $4, 'running')`,
    [id, userId, target, prompt],
  );
}

export async function finishGeneration(
  id: string,
  fields: {
    code: string;
    notes: unknown;
    warnings: unknown;
    totalTokens: number;
  },
): Promise<void> {
  await query(
    `UPDATE generations
        SET status = 'complete', code = $2, notes = $3, warnings = $4,
            total_tokens = $5, finished_at = now()
      WHERE id = $1`,
    [id, fields.code, JSON.stringify(fields.notes), JSON.stringify(fields.warnings), fields.totalTokens],
  );
}

export async function failGeneration(id: string, error: string): Promise<void> {
  await query(
    `UPDATE generations
        SET status = 'failed', error = $2, finished_at = now()
      WHERE id = $1`,
    [id, error.slice(0, 2000)],
  );
}

export async function countRecentGenerations(
  userId: string,
  windowMinutes: number,
): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT count(*)::text AS count
       FROM generations
      WHERE user_id = $1
        AND created_at > now() - ($2 || ' minutes')::interval`,
    [userId, String(windowMinutes)],
  );
  return row ? Number(row.count) : 0;
}

export async function listGenerations(userId: string, limit = 20): Promise<GenerationRow[]> {
  return query<GenerationRow>(
    `SELECT id, user_id, target, prompt, code, status, total_tokens, error,
            created_at, finished_at
       FROM generations
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [userId, limit],
  );
}

// ------------------------------------------------- stripe idempotency

/** Returns true if this is the first time we have seen the event. */
export async function markStripeEventProcessed(id: string, type: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `INSERT INTO stripe_events (id, type)
     VALUES ($1, $2)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [id, type],
  );
  return rows.length > 0;
}
