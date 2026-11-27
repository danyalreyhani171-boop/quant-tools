import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenize, TOKEN_CLASS } from "../src/lib/highlight.ts";

/** Round-trip invariant: tokenising must never lose or add a character. */
function assertLossless(code, language) {
  const joined = tokenize(code, language)
    .map((t) => t.value)
    .join("");
  assert.equal(joined, code, "tokeniser must preserve the source exactly");
}

function kindOf(tokens, value) {
  return tokens.find((t) => t.value === value)?.kind;
}

test("pine: lossless round-trip", () => {
  assertLossless(
    `//@version=6
strategy("X", overlay=true, pyramiding=0)
len = input.int(14, title="Length", group="Signals")
r = ta.rsi(close, len)
if ta.crossover(r, 30) and barstate.isconfirmed
    strategy.entry("Long", strategy.long)
plot(r, "RSI", color=color.new(color.blue, 0))`,
    "pine",
  );
});

test("pine: classifies the version annotation, keywords and namespaces", () => {
  const tokens = tokenize(
    '//@version=6\nvar float x = na\nif ta.rsi(close, 14) > 30\n    x := 1.5',
    "pine",
  );
  assert.equal(kindOf(tokens, "//@version=6"), "annotation");
  assert.equal(kindOf(tokens, "var"), "keyword");
  assert.equal(kindOf(tokens, "float"), "keyword");
  assert.equal(kindOf(tokens, "na"), "keyword");
  assert.equal(kindOf(tokens, "if"), "keyword");
  assert.equal(kindOf(tokens, "ta.rsi"), "builtin");
  assert.equal(kindOf(tokens, "close"), "builtin");
  assert.equal(kindOf(tokens, "14"), "number");
  assert.equal(kindOf(tokens, "1.5"), "number");
  assert.equal(kindOf(tokens, ":="), "operator");
});

test("pine: strings and comments are not confused with code", () => {
  const tokens = tokenize('x = "a // not a comment" // a real comment', "pine");
  assert.equal(kindOf(tokens, '"a // not a comment"'), "string");
  assert.equal(kindOf(tokens, "// a real comment"), "comment");
});

test("pine: dotted namespace constants are one builtin token", () => {
  const tokens = tokenize("c = color.red", "pine");
  assert.equal(kindOf(tokens, "color.red"), "builtin");
});

test("pine: a user function call reads as a function", () => {
  const tokens = tokenize("y = myHelper(close)", "pine");
  assert.equal(kindOf(tokens, "myHelper"), "function");
});

test("mql5: lossless round-trip", () => {
  assertLossless(
    `#property copyright "Me"
#include <Trade\\Trade.mqh>

/* block
   comment */
input double InpLots = 0.10; // Lot size

int OnInit()
{
   if(handle == INVALID_HANDLE) return(INIT_FAILED);
   PrintFormat("x=%.2f", 1.0);
   return(INIT_SUCCEEDED);
}`,
    "mql5",
  );
});

test("mql5: classifies preprocessor, keywords, builtins and constants", () => {
  const tokens = tokenize(
    '#property version "1.00"\ninput double InpLots = 0.1;\nint OnInit() { return(INIT_SUCCEEDED); }',
    "mql5",
  );
  assert.equal(kindOf(tokens, "#property"), "preprocessor");
  assert.equal(kindOf(tokens, "input"), "keyword");
  assert.equal(kindOf(tokens, "double"), "keyword");
  assert.equal(kindOf(tokens, "OnInit"), "builtin");
  assert.equal(kindOf(tokens, "INIT_SUCCEEDED"), "builtin");
  assert.equal(kindOf(tokens, '"1.00"'), "string");
  assert.equal(kindOf(tokens, "0.1"), "number");
});

test("mql5: block comments are a single token", () => {
  const tokens = tokenize("/* a (unbalanced */ int x = 1;", "mql5");
  assert.equal(kindOf(tokens, "/* a (unbalanced */"), "comment");
});

test("mql5: hex and suffixed numbers tokenise as numbers", () => {
  const tokens = tokenize("int a = 0xFF; double b = 1.5e-3; uint c = 10u;", "mql5");
  assert.equal(kindOf(tokens, "0xFF"), "number");
  assert.equal(kindOf(tokens, "1.5e-3"), "number");
  assert.equal(kindOf(tokens, "10u"), "number");
});

test("mql5: unterminated string does not swallow the rest of the file", () => {
  const code = 'string s = "oops\nint x = 1;';
  assertLossless(code, "mql5");
  const tokens = tokenize(code, "mql5");
  assert.equal(kindOf(tokens, "int"), "keyword");
});

test("every token kind has a class", () => {
  const code = '//@version=6\nindicator("x")\nv = ta.sma(close, 14) + 1';
  for (const token of tokenize(code, "pine")) {
    assert.ok(TOKEN_CLASS[token.kind], `missing class for ${token.kind}`);
  }
});

test("empty input yields no tokens", () => {
  assert.deepEqual(tokenize("", "pine"), []);
  assert.deepEqual(tokenize("", "mql5"), []);
});

test("multi-character operators are not split apart", () => {
  const pine = tokenize("a := b == c ? 1 : 2\nd => e", "pine");
  assert.equal(kindOf(pine, ":="), "operator");
  assert.equal(kindOf(pine, "=="), "operator");
  assert.equal(kindOf(pine, "=>"), "operator");
  assert.equal(kindOf(pine, "?"), "operator");

  const mql = tokenize("a++; b <<= 2; CClass::Method(); x->y; p != q;", "mql5");
  for (const op of ["++", "<<=", "::", "->", "!="]) {
    assert.equal(kindOf(mql, op), "operator", `expected ${op} to be one token`);
  }
});
