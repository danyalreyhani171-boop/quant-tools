import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractCode,
  extractSection,
  extractVerdict,
  findCodeBlocks,
  normaliseCode,
  sanityCheck,
} from "../src/lib/agents/extract.ts";

const PINE_FILE = `//@version=6
indicator("Test", overlay=true)
length = input.int(14, title="Length")
rsiValue = ta.rsi(close, length)
plot(rsiValue, color=color.blue)`;

const MQL5_FILE = `#property copyright "Test"
#property indicator_chart_window
#property indicator_buffers 1
#property indicator_plots 1

double Buffer[];

int OnInit()
{
   SetIndexBuffer(0, Buffer, INDICATOR_DATA);
   return(INIT_SUCCEEDED);
}

int OnCalculate(const int rates_total, const int prev_calculated,
                const datetime &time[], const double &open[],
                const double &high[], const double &low[],
                const double &close[], const long &tick_volume[],
                const long &volume[], const int &spread[])
{
   return(rates_total);
}`;

test("findCodeBlocks reads a simple fenced block", () => {
  const blocks = findCodeBlocks("Intro\n\n```pine\nfoo = 1\n```\n\nOutro");
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].tag, "pine");
  assert.equal(blocks[0].code, "foo = 1");
});

test("findCodeBlocks reads several blocks", () => {
  const blocks = findCodeBlocks("```js\na\n```\ntext\n```pine\nb\n```");
  assert.equal(blocks.length, 2);
  assert.deepEqual(
    blocks.map((b) => b.tag),
    ["js", "pine"],
  );
});

test("findCodeBlocks handles a longer fence wrapping a shorter one", () => {
  const blocks = findCodeBlocks("````markdown\n```pine\ninner\n```\n````");
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].code, "```pine\ninner\n```");
});

test("findCodeBlocks ignores an unterminated fence", () => {
  const blocks = findCodeBlocks("```pine\nnever closed");
  assert.equal(blocks.length, 0);
});

test("extractCode prefers the block under the named heading", () => {
  const response = `### Issues found
1. Something was wrong.

\`\`\`pine
// the OLD broken version
//@version=6
indicator("Old")
\`\`\`

### Corrected file
\`\`\`pine
${PINE_FILE}
\`\`\``;
  const code = extractCode(response, "pine", ["Corrected file"]);
  assert.ok(code.includes('indicator("Test"'), "should pick the corrected file");
  assert.ok(!code.includes("Old"), "should not pick the earlier block");
});

test("extractCode falls back to the best-scoring block", () => {
  const response = `Here is some prose in a block:

\`\`\`text
This is a long explanation that goes on and on and should not be mistaken
for a code file even though it is quite long indeed, line after line.
\`\`\`

\`\`\`pine
${PINE_FILE}
\`\`\``;
  const code = extractCode(response, "pine", []);
  assert.ok(code.startsWith("//@version=6"));
});

test("extractCode picks mql5 over a pine-tagged block when targeting mql5", () => {
  const response = `\`\`\`pine
//@version=6
indicator("Wrong platform")
\`\`\`

\`\`\`mql5
${MQL5_FILE}
\`\`\``;
  const code = extractCode(response, "mql5", []);
  assert.ok(code.includes("OnCalculate"));
});

test("extractCode accepts an untagged fence", () => {
  const code = extractCode("```\n" + PINE_FILE + "\n```", "pine", []);
  assert.ok(code.includes("ta.rsi"));
});

test("extractCode accepts a fenceless response that is clearly code", () => {
  const code = extractCode(PINE_FILE, "pine", []);
  assert.ok(code.startsWith("//@version=6"));
});

test("extractCode returns null for prose with no code", () => {
  assert.equal(extractCode("I am afraid I cannot help with that.", "pine", []), null);
});

test("extractSection reads a section body and stops at the next heading", () => {
  const text = `### Verdict
FIXED

### Trace notes
Bar 1 was fine.
Bar 2 was also fine.

### Verified file
code here`;
  assert.equal(extractSection(text, "Verdict"), "FIXED");
  assert.equal(extractSection(text, "Trace notes"), "Bar 1 was fine.\nBar 2 was also fine.");
  assert.equal(extractSection(text, "Missing"), null);
});

test("extractSection ignores # inside a fenced block", () => {
  const text = `### Final file
\`\`\`mql5
#property copyright "x"
#include <Trade\\Trade.mqh>
\`\`\`

### What this does
It trades.`;
  const section = extractSection(text, "Final file");
  assert.ok(section.includes("#property"));
  assert.ok(!section.includes("It trades"));
  assert.equal(extractSection(text, "What this does"), "It trades.");
});

test("extractVerdict reads both verdicts and defaults to UNKNOWN", () => {
  assert.equal(extractVerdict("### Verdict\nPASS\n\n### Notes\nfine"), "PASS");
  assert.equal(extractVerdict("### Verdict\n`FIXED`\n"), "FIXED");
  assert.equal(extractVerdict("### Verdict\nThe code was FIXED after review."), "FIXED");
  assert.equal(extractVerdict("no verdict anywhere in this text"), "UNKNOWN");
});

test("normaliseCode strips padding and normalises newlines", () => {
  assert.equal(normaliseCode("\r\n\r\nfoo\r\nbar\r\n\r\n  "), "foo\nbar\n");
});

test("sanityCheck passes a well-formed pine file", () => {
  const result = sanityCheck(PINE_FILE, "pine");
  assert.equal(result.ok, true, result.problems.join("; "));
});

test("sanityCheck passes a well-formed mql5 file", () => {
  const result = sanityCheck(MQL5_FILE, "mql5");
  assert.equal(result.ok, true, result.problems.join("; "));
});

test("sanityCheck catches a missing version annotation", () => {
  const result = sanityCheck('indicator("x")\nplot(close)\n// padding to pass the length check ok', "pine");
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((p) => p.includes("//@version=6")));
});

test("sanityCheck catches two declarations", () => {
  const code = `//@version=6
indicator("a")
strategy("b")
plot(close)
// padding padding padding padding padding padding`;
  const result = sanityCheck(code, "pine");
  assert.ok(result.problems.some((p) => p.includes("More than one")));
});

test("sanityCheck catches pre-v5 built-ins", () => {
  const code = `//@version=6
indicator("x")
value = sma(close, 14)
plot(value)
// padding padding padding padding padding`;
  const result = sanityCheck(code, "pine");
  assert.ok(result.problems.some((p) => p.includes("pre-v5")));
});

test("sanityCheck does not flag ta.-prefixed built-ins", () => {
  const code = `//@version=6
indicator("x")
value = ta.sma(close, 14)
other = ta.crossover(close, value)
plot(value)`;
  const result = sanityCheck(code, "pine");
  assert.equal(result.ok, true, result.problems.join("; "));
});

test("sanityCheck catches unbalanced brackets", () => {
  const code = `//@version=6
indicator("x"
plot(close)
// padding padding padding padding padding`;
  const result = sanityCheck(code, "pine");
  assert.ok(result.problems.some((p) => p.includes("Unbalanced")));
});

test("sanityCheck ignores brackets inside strings and comments", () => {
  const code = `//@version=6
indicator("x")
// a stray ( in a comment
label = "unmatched ) in a string"
plot(close)`;
  const result = sanityCheck(code, "pine");
  assert.equal(result.ok, true, result.problems.join("; "));
});

test("sanityCheck ignores brackets inside mql5 block comments", () => {
  const code = MQL5_FILE + "\n/* a stray ( here */\n";
  const result = sanityCheck(code, "mql5");
  assert.equal(result.ok, true, result.problems.join("; "));
});

test("sanityCheck catches TODO markers and truncation", () => {
  const code = PINE_FILE + "\n// TODO: finish this\n...\n";
  const result = sanityCheck(code, "pine");
  assert.ok(result.problems.some((p) => p.includes("TODO")));
  assert.ok(result.problems.some((p) => p.includes("truncated")));
});
