import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveAccess } from "../src/lib/subscription.ts";

const NOW = new Date("2026-06-15T12:00:00Z").getTime();
const FUTURE = new Date("2026-07-15T12:00:00Z");
const PAST = new Date("2026-05-15T12:00:00Z");

const row = (status, periodEnd = null) => ({
  subscription_status: status,
  current_period_end: periodEnd,
});

test("active grants access", () => {
  const access = deriveAccess(row("active", FUTURE), NOW);
  assert.equal(access.isSubscribed, true);
  assert.equal(access.needsAttention, false);
});

test("active grants access even with no period end recorded", () => {
  assert.equal(deriveAccess(row("active", null), NOW).isSubscribed, true);
});

test("active grants access even if the stored period end has passed", () => {
  // A renewal webhook can lag; an explicitly active subscription still wins.
  assert.equal(deriveAccess(row("active", PAST), NOW).isSubscribed, true);
});

test("trialing grants access", () => {
  assert.equal(deriveAccess(row("trialing", FUTURE), NOW).isSubscribed, true);
});

test("no subscription denies access", () => {
  const access = deriveAccess(row(null, null), NOW);
  assert.equal(access.isSubscribed, false);
  assert.equal(access.needsAttention, false);
});

test("cancelled keeps access until the paid period ends", () => {
  assert.equal(deriveAccess(row("canceled", FUTURE), NOW).isSubscribed, true);
  assert.equal(deriveAccess(row("canceled", PAST), NOW).isSubscribed, false);
});

test("cancelled with no period end denies access", () => {
  assert.equal(deriveAccess(row("canceled", null), NOW).isSubscribed, false);
});

test("past_due keeps access during the retry window but flags attention", () => {
  const inWindow = deriveAccess(row("past_due", FUTURE), NOW);
  assert.equal(inWindow.isSubscribed, true);
  assert.equal(inWindow.needsAttention, true);

  const lapsed = deriveAccess(row("past_due", PAST), NOW);
  assert.equal(lapsed.isSubscribed, false);
  assert.equal(lapsed.needsAttention, true);
});

test("unpaid behaves like past_due", () => {
  assert.equal(deriveAccess(row("unpaid", FUTURE), NOW).isSubscribed, true);
  assert.equal(deriveAccess(row("unpaid", PAST), NOW).isSubscribed, false);
  assert.equal(deriveAccess(row("unpaid", PAST), NOW).needsAttention, true);
});

test("incomplete and expired never grant access", () => {
  for (const status of ["incomplete", "incomplete_expired"]) {
    assert.equal(
      deriveAccess(row(status, FUTURE), NOW).isSubscribed,
      false,
      `${status} must not grant access`,
    );
  }
});

test("paused keeps access only until the period ends", () => {
  assert.equal(deriveAccess(row("paused", FUTURE), NOW).isSubscribed, true);
  assert.equal(deriveAccess(row("paused", PAST), NOW).isSubscribed, false);
});

test("an unrecognised status denies access", () => {
  assert.equal(deriveAccess(row("something_new", FUTURE), NOW).isSubscribed, false);
});

test("a non-Date period end is treated as absent", () => {
  const access = deriveAccess(
    { subscription_status: "canceled", current_period_end: "2026-07-15" },
    NOW,
  );
  assert.equal(access.isSubscribed, false);
});

test("the period boundary is exclusive", () => {
  const exactly = new Date(NOW);
  assert.equal(deriveAccess(row("canceled", exactly), NOW).isSubscribed, false);
  assert.equal(deriveAccess(row("canceled", new Date(NOW + 1)), NOW).isSubscribed, true);
});
