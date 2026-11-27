/**
 * In-process fixed-window rate limiting.
 *
 * Good enough for login/signup burst protection on a single instance. It is
 * intentionally not the control for paid generation quota — that is counted in
 * Postgres (see `countRecentGenerations`) so it survives restarts and holds
 * across instances.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

declare global {
  var __dr71RateBuckets: Map<string, Bucket> | undefined;
}

function buckets(): Map<string, Bucket> {
  if (!globalThis.__dr71RateBuckets) {
    globalThis.__dr71RateBuckets = new Map();
  }
  return globalThis.__dr71RateBuckets;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const store = buckets();
  const now = Date.now();

  // Opportunistic sweep so a long-running process does not grow unbounded.
  if (store.size > 5000) {
    for (const [k, v] of store) {
      if (v.resetAt <= now) store.delete(k);
    }
  }

  const existing = store.get(key);
  if (!existing || existing.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  return {
    allowed: true,
    remaining: limit - existing.count,
    retryAfterSeconds: 0,
  };
}

/** Best-effort client identifier for anonymous endpoints. */
export function clientKey(request: Request, scope: string): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown";
  return `${scope}:${ip}`;
}

/** Generations allowed per rolling window, per subscriber. */
export const GENERATION_LIMIT = Number(process.env.GENERATION_LIMIT_PER_HOUR ?? 30);
export const GENERATION_WINDOW_MINUTES = 60;
