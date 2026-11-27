import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkPasswordStrength,
  hashPassword,
  isValidEmail,
  verifyPassword,
} from "../src/lib/password.ts";

test("a hashed password verifies", async () => {
  const hash = await hashPassword("correct horse battery 1");
  assert.equal(await verifyPassword("correct horse battery 1", hash), true);
});

test("a wrong password does not verify", async () => {
  const hash = await hashPassword("correct horse battery 1");
  assert.equal(await verifyPassword("correct horse battery 2", hash), false);
  assert.equal(await verifyPassword("", hash), false);
});

test("hashes are salted, so the same password hashes differently", async () => {
  const a = await hashPassword("same password 1");
  const b = await hashPassword("same password 1");
  assert.notEqual(a, b);
  assert.equal(await verifyPassword("same password 1", a), true);
  assert.equal(await verifyPassword("same password 1", b), true);
});

test("the hash records its own parameters", async () => {
  const hash = await hashPassword("parameters 1");
  const [algorithm, N, r, p] = hash.split("$");
  assert.equal(algorithm, "scrypt");
  assert.equal(Number(N), 32768);
  assert.equal(Number(r), 8);
  assert.equal(Number(p), 1);
  assert.equal(hash.split("$").length, 6);
});

test("a malformed stored hash fails closed rather than throwing", async () => {
  for (const bad of ["", "nonsense", "bcrypt$1$2$3$4$5", "scrypt$a$b$c$d$e", "scrypt$32768$8$1$$"]) {
    assert.equal(await verifyPassword("anything", bad), false, `should reject: ${bad}`);
  }
});

test("unicode passwords normalise, so the same text always verifies", async () => {
  // "é" as one code point vs. "e" + combining accent.
  const composed = "passéword 1";
  const decomposed = "passéword 1";
  const hash = await hashPassword(composed);
  assert.equal(await verifyPassword(decomposed, hash), true);
});

test("password strength rules", () => {
  assert.equal(checkPasswordStrength("short1").ok, false);
  assert.equal(checkPasswordStrength("alllettersonly").ok, false);
  assert.equal(checkPasswordStrength("1234567890").ok, false);
  assert.equal(checkPasswordStrength("goodenough1").ok, true);
  assert.equal(checkPasswordStrength("a1".repeat(120)).ok, false);
});

test("email validation", () => {
  for (const good of ["a@b.co", "first.last+tag@example.com", "x@sub.example.org"]) {
    assert.equal(isValidEmail(good), true, `should accept ${good}`);
  }
  for (const bad of ["", "a", "a@b", "a@@b.com", "a b@c.com", "@b.com", "a@.com", `${"a".repeat(250)}@b.com`]) {
    assert.equal(isValidEmail(bad), false, `should reject ${bad}`);
  }
});
