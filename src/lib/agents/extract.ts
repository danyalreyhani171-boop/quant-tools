/**
 * Pulling structured data back out of free-form model output.
 *
 * Models are instructed to use fenced code blocks and `### Heading` sections,
 * but they drift: they add prose, use the wrong fence tag, nest fences inside
 * comments, or forget the fence entirely. These helpers are deliberately
 * forgiving, and ordered from most-trusted signal to last-resort fallback.
 */

export interface CodeBlock {
  tag: string;
  code: string;
}

/**
 * Finds every top-level fenced code block.
 *
 * Handles fences of three or more backticks (a longer fence can legally
 * contain a shorter one) and ignores unterminated trailing fences.
 */
export function findCodeBlocks(text: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  // Fences must start at the beginning of a line, optionally indented.
  const fenceRe = /^[ \t]{0,3}(`{3,})[ \t]*([A-Za-z0-9_+-]*)[ \t]*\r?\n/gm;
  let match: RegExpExecArray | null;

  while ((match = fenceRe.exec(text)) !== null) {
    const fence = match[1] ?? "```";
    const tag = (match[2] ?? "").toLowerCase();
    const bodyStart = match.index + match[0].length;

    // Find the matching closing fence: same length or longer, alone on its line.
    const closeRe = new RegExp(`^[ \\t]{0,3}\`{${fence.length},}[ \\t]*$`, "m");
    closeRe.lastIndex = 0;
    const rest = text.slice(bodyStart);
    const closeMatch = closeRe.exec(rest);
    if (!closeMatch) break; // unterminated fence — nothing reliable left

    const code = rest.slice(0, closeMatch.index);
    blocks.push({ tag, code: code.replace(/\s+$/, "") });

    // Continue scanning after the closing fence.
    fenceRe.lastIndex = bodyStart + closeMatch.index + closeMatch[0].length;
  }

  return blocks;
}

/** Language tags a model might plausibly use for each target language. */
const TAG_ALIASES: Record<string, readonly string[]> = {
  pine: ["pine", "pinescript", "pine_script", "tradingview", "ps", "js"],
  mql5: ["mql5", "mql", "mq5", "mql4", "cpp", "c++", "c"],
};

/**
 * Scores a candidate block as "the code file we want".
 *
 * Length alone is a bad signal — a long explanation block beats a short but
 * correct file. So we weight language-specific landmarks heavily.
 */
function scoreBlock(block: CodeBlock, language: "pine" | "mql5"): number {
  let score = 0;
  const aliases = TAG_ALIASES[language] ?? [];
  const code = block.code;

  if (block.tag && aliases.includes(block.tag)) score += 120;
  else if (!block.tag) score += 20;
  else if (TAG_ALIASES[language === "pine" ? "mql5" : "pine"]?.includes(block.tag)) score -= 40;
  else score -= 20;

  if (language === "pine") {
    if (/^\s*\/\/@version\s*=\s*6/m.test(code)) score += 220;
    else if (/^\s*\/\/@version\s*=/m.test(code)) score += 120;
    if (/^\s*(indicator|strategy)\s*\(/m.test(code)) score += 180;
    if (/\bta\.\w+\s*\(/.test(code)) score += 40;
    if (/\binput\.(int|float|bool|string|source|color)\s*\(/.test(code)) score += 40;
    if (/\bplot\w*\s*\(/.test(code)) score += 20;
    if (/\bstrategy\.(entry|exit|close)\s*\(/.test(code)) score += 30;
  } else {
    if (/#property\s+\w+/.test(code)) score += 180;
    if (/\b(OnInit|OnCalculate|OnTick)\s*\(/.test(code)) score += 200;
    if (/\binput\s+(int|double|bool|string|ENUM_|group)/.test(code)) score += 40;
    if (/\b(SetIndexBuffer|CopyBuffer|SymbolInfo\w+)\s*\(/.test(code)) score += 40;
    if (/#include\s*<Trade/i.test(code)) score += 30;
  }

  // Prefer substantial files, but with diminishing returns so a 400-line
  // explanation never outranks a 90-line real file.
  score += Math.min(60, Math.floor(code.split("\n").length / 4));

  return score;
}

/**
 * Prefers the code block under a named `### Heading`, then falls back to the
 * best-scoring block anywhere in the response.
 */
export function extractCode(
  text: string,
  language: "pine" | "mql5",
  preferredHeadings: readonly string[] = [],
): string | null {
  // 1. A block directly under one of the headings we asked the agent to use.
  for (const heading of preferredHeadings) {
    const headingRe = new RegExp(
      `^#{1,6}\\s*${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`,
      "im",
    );
    const headingMatch = headingRe.exec(text);
    if (!headingMatch) continue;
    const after = text.slice(headingMatch.index + headingMatch[0].length);
    const blocks = findCodeBlocks(after);
    const first = blocks[0];
    if (first && first.code.trim()) {
      // Only trust it if it looks like code at all, not prose.
      if (scoreBlock(first, language) > 0) return first.code;
    }
  }

  // 2. Best-scoring fenced block in the whole response.
  const blocks = findCodeBlocks(text).filter((b) => b.code.trim().length > 0);
  if (blocks.length > 0) {
    let best = blocks[0]!;
    let bestScore = scoreBlock(best, language);
    for (const block of blocks.slice(1)) {
      const score = scoreBlock(block, language);
      // Ties go to the later block: later usually means "the corrected version".
      if (score >= bestScore) {
        best = block;
        bestScore = score;
      }
    }
    if (bestScore > 0) return best.code;
  }

  // 3. No usable fence. If the raw response itself looks like a code file,
  //    take it — some models drop the fence on long outputs.
  const raw: CodeBlock = { tag: "", code: text.trim() };
  if (scoreBlock(raw, language) >= 180) return raw.code;

  return null;
}

/** Extracts the body of a `### Heading` section, up to the next heading of the same or higher level. */
export function extractSection(text: string, heading: string): string | null {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^(#{1,6})\\s*${escaped}\\s*$`, "im");
  const match = re.exec(text);
  if (!match) return null;

  const level = (match[1] ?? "###").length;
  const bodyStart = match.index + match[0].length;
  const rest = text.slice(bodyStart);

  // Next heading at the same level or shallower ends the section. Skip headings
  // that are inside fenced blocks (a `#` in MQL5 is a preprocessor directive).
  const lines = rest.split("\n");
  const kept: string[] = [];
  let inFence = false;

  for (const line of lines) {
    if (/^[ \t]{0,3}`{3,}/.test(line)) {
      inFence = !inFence;
      kept.push(line);
      continue;
    }
    if (!inFence) {
      const h = /^(#{1,6})\s+\S/.exec(line);
      if (h && (h[1] ?? "").length <= level) break;
    }
    kept.push(line);
  }

  const body = kept.join("\n").trim();
  return body.length > 0 ? body : null;
}

/** Reads the verifier's `PASS` / `FIXED` verdict, tolerating surrounding prose and backticks. */
export function extractVerdict(text: string): "PASS" | "FIXED" | "UNKNOWN" {
  const section = extractSection(text, "Verdict");
  const haystack = (section ?? text.slice(0, 1200)).toUpperCase();
  // Check FIXED first: "PASS (no changes)" and "FIXED" can both appear in prose,
  // and a reported fix is the more conservative reading.
  if (/\bFIXED\b/.test(haystack)) return "FIXED";
  if (/\bPASS(?:ED|ES)?\b/.test(haystack)) return "PASS";
  return "UNKNOWN";
}

/** Strips a leading/trailing blank-line-only padding and normalises line endings. */
export function normaliseCode(code: string): string {
  return code
    .replace(/\r\n?/g, "\n")
    .replace(/^\n+/, "")
    .replace(/\s+$/, "")
    .concat("\n");
}

/**
 * Last-resort sanity check before showing code to a paying user.
 * Catches the failure modes that are cheap to detect and embarrassing to ship.
 */
export function sanityCheck(
  code: string,
  language: "pine" | "mql5",
): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  const lines = code.split("\n");

  if (code.trim().length < 80) problems.push("The generated file is suspiciously short.");

  if (/\b(TODO|FIXME|XXX)\b/.test(code)) {
    problems.push("The file still contains TODO/FIXME markers.");
  }
  if (/^\s*\.\.\.\s*$/m.test(code)) {
    problems.push("The file contains a `...` placeholder — it may be truncated.");
  }

  // Bracket balance, ignoring brackets inside strings and comments.
  const counts: Record<string, number> = { "(": 0, "[": 0, "{": 0 };
  const closers: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  let inBlockComment = false;

  for (const line of lines) {
    let i = 0;
    while (i < line.length) {
      const ch = line[i]!;
      const next = line[i + 1];
      if (inBlockComment) {
        if (ch === "*" && next === "/") {
          inBlockComment = false;
          i += 2;
          continue;
        }
        i += 1;
        continue;
      }
      if (ch === "/" && next === "/") break; // line comment
      if (ch === "/" && next === "*") {
        inBlockComment = true;
        i += 2;
        continue;
      }
      if (ch === '"' || ch === "'") {
        const quote = ch;
        i += 1;
        while (i < line.length) {
          if (line[i] === "\\") {
            i += 2;
            continue;
          }
          if (line[i] === quote) {
            i += 1;
            break;
          }
          i += 1;
        }
        continue;
      }
      if (ch in counts) counts[ch] = (counts[ch] ?? 0) + 1;
      const opener = closers[ch];
      if (opener) counts[opener] = (counts[opener] ?? 0) - 1;
      i += 1;
    }
  }

  for (const [bracket, delta] of Object.entries(counts)) {
    if (delta !== 0) {
      problems.push(
        `Unbalanced \`${bracket}\` brackets (${delta > 0 ? `${delta} unclosed` : `${-delta} extra closing`}).`,
      );
    }
  }

  if (language === "pine") {
    if (!/^\s*\/\/@version\s*=\s*6/m.test(code)) {
      problems.push("Missing `//@version=6` annotation.");
    }
    const declarations = (code.match(/^\s*(indicator|strategy)\s*\(/gm) ?? []).length;
    if (declarations === 0) problems.push("No `indicator()` or `strategy()` declaration found.");
    if (declarations > 1) {
      problems.push("More than one `indicator()`/`strategy()` declaration found.");
    }
    const legacy = code.match(
      /(?<![.\w])(?:sma|ema|rsi|atr|crossover|crossunder|security|valuewhen|barssince)\s*\(/g,
    );
    if (legacy) {
      problems.push(
        `Uses pre-v5 unprefixed built-ins (${[...new Set(legacy.map((m) => m.replace(/\s*\($/, "")))].join(", ")}) — these need the \`ta.\` namespace.`,
      );
    }
  } else {
    if (!/#property/.test(code)) problems.push("No `#property` directives found.");
    if (!/\bOnInit\s*\(/.test(code)) problems.push("No `OnInit()` function found.");
    if (!/\b(OnCalculate|OnTick)\s*\(/.test(code)) {
      problems.push("No `OnCalculate()` or `OnTick()` function found.");
    }
  }

  return { ok: problems.length === 0, problems };
}
