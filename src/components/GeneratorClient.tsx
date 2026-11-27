"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import AgentTimeline, { INITIAL_AGENTS, type AgentRow } from "./AgentTimeline";
import CodeBlock from "./CodeBlock";
import PasteGuide from "./PasteGuide";
import Prose from "./Prose";
import { TARGETS, TARGET_IDS, type TargetId } from "@/lib/targets";

interface GenerationNotes {
  whatThisDoes: string | null;
  inputsToSetFirst: string | null;
  knownLimitations: string | null;
  verifierVerdict: "PASS" | "FIXED" | "UNKNOWN";
  remainingRisks: string | null;
}

interface Result {
  code: string;
  language: "pine" | "mql5";
  fileName: string;
  notes: GenerationNotes;
  warnings: string[];
  totalTokens: number;
  elapsedMs: number;
  targetId: TargetId;
}

const EXAMPLES: { label: string; target: TargetId; prompt: string }[] = [
  {
    label: "RSI mean reversion",
    target: "tv-strategy",
    prompt:
      "Buy when the 14-period RSI drops below 30 and then crosses back above 30, as long as price is above the 200-period EMA. Exit when RSI crosses above 70 or the 2x ATR stop is hit. Risk 1% of the account per trade.",
  },
  {
    label: "EMA cross trend following",
    target: "mt5-ea",
    prompt:
      "Go long when the 20 EMA crosses above the 50 EMA and the 50 EMA is rising. Go short on the opposite cross. Use a stop loss of 1.5x ATR(14) and a take profit of 3x ATR(14). Only trade between 08:00 and 18:00 server time, one position at a time.",
  },
  {
    label: "Volatility squeeze alert",
    target: "tv-indicator",
    prompt:
      "Show me when Bollinger Bands (20, 2) narrow inside the Keltner Channel (20, 1.5) — a squeeze — and colour the background. Plot an arrow when the squeeze releases and momentum is positive, and raise an alert on that bar.",
  },
  {
    label: "Donchian breakout",
    target: "mt5-indicator",
    prompt:
      "Plot the 20-bar highest high and lowest low as two lines, plus the midline. Draw an up arrow when price closes above the previous 20-bar high and a down arrow when it closes below the previous 20-bar low.",
  },
];

const MAX_PROMPT = 6000;
const MIN_PROMPT = 15;

/** Reads an SSE byte stream and yields each `data:` payload as it arrives. */
async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Events are separated by a blank line.
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const chunk = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");

        const data = chunk
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");

        if (!data) continue; // keepalive comment
        try {
          yield JSON.parse(data);
        } catch {
          /* ignore a malformed frame rather than killing the run */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export default function GeneratorClient({ initialTarget }: { initialTarget?: TargetId }) {
  const [targetId, setTargetId] = useState<TargetId>(initialTarget ?? "tv-strategy");
  const [prompt, setPrompt] = useState("");
  const [agents, setAgents] = useState<AgentRow[]>(INITIAL_AGENTS);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  const controllerRef = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const target = TARGETS[targetId];
  const tooShort = prompt.trim().length < MIN_PROMPT;
  const tooLong = prompt.length > MAX_PROMPT;

  // A visible clock, because six model calls take a couple of minutes and
  // silence makes people reload the page. `startedAt` is set in `generate`, so
  // this effect only has to drive the tick.
  useEffect(() => {
    if (startedAt === null) return;
    const timer = setInterval(() => setElapsed(Date.now() - startedAt), 500);
    return () => clearInterval(timer);
  }, [startedAt]);

  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setRunning(false);
    setStartedAt(null);
    setAgents((rows) =>
      rows.map((row) => (row.state === "running" ? { ...row, state: "pending" } : row)),
    );
  }, []);

  const generate = useCallback(async () => {
    if (running || tooShort || tooLong) return;

    const controller = new AbortController();
    controllerRef.current = controller;

    setRunning(true);
    setStartedAt(Date.now());
    setElapsed(0);
    setError(null);
    setErrorCode(null);
    setResult(null);
    setAgents(INITIAL_AGENTS.map((row) => ({ ...row, state: "pending" })));

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), target: targetId }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; code?: string }
          | null;
        setError(payload?.error ?? `The request failed (${response.status}).`);
        setErrorCode(payload?.code ?? null);
        setRunning(false);
        return;
      }

      for await (const event of readSse(response.body)) {
        const e = event as Record<string, unknown>;

        switch (e.type) {
          case "agent_start": {
            const index = Number(e.index);
            setAgents((rows) =>
              rows.map((row, i) =>
                i === index
                  ? { ...row, state: "running", model: String(e.model ?? ""), error: undefined }
                  : row,
              ),
            );
            break;
          }
          case "agent_done": {
            const index = Number(e.index);
            setAgents((rows) =>
              rows.map((row, i) =>
                i === index
                  ? {
                      ...row,
                      state: "done",
                      summary: String(e.summary ?? ""),
                      elapsedMs: Number(e.elapsedMs ?? 0),
                    }
                  : row,
              ),
            );
            break;
          }
          case "agent_error": {
            const index = Number(e.index);
            setAgents((rows) =>
              rows.map((row, i) =>
                i === index
                  ? { ...row, state: "error", error: String(e.message ?? "Failed") }
                  : row,
              ),
            );
            break;
          }
          case "complete": {
            setResult({
              code: String(e.code ?? ""),
              language: e.language === "mql5" ? "mql5" : "pine",
              fileName: String(e.fileName ?? "strategy.txt"),
              notes: e.notes as GenerationNotes,
              warnings: Array.isArray(e.warnings) ? (e.warnings as string[]) : [],
              totalTokens: Number(e.totalTokens ?? 0),
              elapsedMs: Number(e.elapsedMs ?? 0),
              targetId,
            });
            // Any stage that errored but was recovered reads as skipped, not failed.
            setAgents((rows) =>
              rows.map((row) => (row.state === "error" ? { ...row, state: "skipped" } : row)),
            );
            break;
          }
          case "error": {
            setError(String(e.message ?? "The generation failed."));
            break;
          }
        }
      }
    } catch (caught) {
      if (!(caught instanceof Error && caught.name === "AbortError")) {
        setError(
          caught instanceof Error
            ? `Lost the connection: ${caught.message}`
            : "Lost the connection to the server.",
        );
      }
    } finally {
      setRunning(false);
      setStartedAt(null);
      controllerRef.current = null;
    }
  }, [prompt, running, targetId, tooLong, tooShort]);

  // Jump to the finished file once, when it appears.
  useEffect(() => {
    if (result) {
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [result]);

  const grouped = useMemo(() => {
    const byPlatform = new Map<string, TargetId[]>();
    for (const id of TARGET_IDS) {
      const platform = TARGETS[id].platform;
      byPlatform.set(platform, [...(byPlatform.get(platform) ?? []), id]);
    }
    return [...byPlatform.entries()];
  }, []);

  return (
    <div className="space-y-8">
      {/* ---------------- 1. Describe ---------------- */}
      <section>
        <div className="mb-3 flex items-baseline gap-2.5">
          <span className="grid size-6 place-items-center rounded-md bg-brand-500/15 font-mono text-xs font-bold text-brand-300 ring-1 ring-brand-500/25">
            1
          </span>
          <h2 className="text-lg font-semibold text-slate-100">Describe your strategy</h2>
        </div>

        <label htmlFor="strategy-prompt" className="sr-only">
          Your trading strategy in plain English
        </label>
        <textarea
          id="strategy-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          disabled={running}
          rows={7}
          spellCheck
          placeholder="Buy when the 50 EMA crosses above the 200 EMA and RSI(14) is above 50. Exit when the 50 crosses back below, or when a 2x ATR stop is hit. Use a 1:2 risk-to-reward take profit and risk 1% of the account per trade."
          className="w-full resize-y rounded-xl border border-ink-600 bg-ink-800 px-4 py-3.5 text-[15px] leading-relaxed text-slate-100 placeholder:text-ink-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 focus:outline-none disabled:opacity-60"
        />

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <p className="text-muted">
            Name your indicators, your entry and exit rules, and your risk. The more specific you
            are, the less the agents have to guess.
          </p>
          <span className={`font-mono tabular-nums ${tooLong ? "text-red-400" : "text-ink-500"}`}>
            {prompt.length.toLocaleString()}/{MAX_PROMPT.toLocaleString()}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Try:</span>
          {EXAMPLES.map((example) => (
            <button
              key={example.label}
              type="button"
              disabled={running}
              onClick={() => {
                setPrompt(example.prompt);
                setTargetId(example.target);
              }}
              className="rounded-full border border-ink-600 bg-ink-800 px-3 py-1 text-xs text-slate-300 transition hover:border-brand-500/50 hover:text-white disabled:opacity-50"
            >
              {example.label}
            </button>
          ))}
        </div>
      </section>

      {/* ---------------- 2. Choose output ---------------- */}
      <section>
        <div className="mb-3 flex items-baseline gap-2.5">
          <span className="grid size-6 place-items-center rounded-md bg-brand-500/15 font-mono text-xs font-bold text-brand-300 ring-1 ring-brand-500/25">
            2
          </span>
          <h2 className="text-lg font-semibold text-slate-100">Choose your code output</h2>
        </div>

        <fieldset disabled={running} className="space-y-4">
          <legend className="sr-only">Code output</legend>
          {grouped.map(([platform, ids]) => (
            <div key={platform}>
              <p className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">
                {platform}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {ids.map((id) => {
                  const option = TARGETS[id];
                  const selected = id === targetId;
                  return (
                    <label
                      key={id}
                      className={`relative cursor-pointer rounded-xl border p-4 transition ${
                        selected
                          ? "border-brand-500 bg-brand-500/10 ring-1 ring-brand-500/40"
                          : "border-ink-600 bg-ink-800/60 hover:border-ink-500"
                      } ${running ? "cursor-not-allowed opacity-60" : ""}`}
                    >
                      <input
                        type="radio"
                        name="target"
                        value={id}
                        checked={selected}
                        onChange={() => setTargetId(id)}
                        className="peer sr-only"
                      />
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-100">{option.label}</p>
                          <p className="mt-1 text-xs leading-relaxed text-muted">
                            {option.tagline}
                          </p>
                        </div>
                        <span
                          aria-hidden
                          className={`mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full border transition ${
                            selected ? "border-brand-400 bg-brand-500" : "border-ink-500"
                          }`}
                        >
                          {selected && <span className="size-1.5 rounded-full bg-white" />}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <span className="rounded bg-ink-700 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                          {option.languageLabel}
                        </span>
                        {option.executes && (
                          <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                            Places orders
                          </span>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </fieldset>
      </section>

      {/* ---------------- 3. Generate ---------------- */}
      <section>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={generate}
            disabled={running || tooShort || tooLong}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-ink-500"
          >
            {running ? (
              <>
                <svg viewBox="0 0 24 24" className="size-4 animate-spin" fill="none" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" opacity="0.25" />
                  <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeLinecap="round" />
                </svg>
                Generating… {(elapsed / 1000).toFixed(0)}s
              </>
            ) : (
              <>
                Generate {target.languageLabel}
                <svg viewBox="0 0 24 24" className="size-4" fill="none" strokeWidth="2">
                  <path
                    d="M5 12h13M13 6l6 6-6 6"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </>
            )}
          </button>

          {running && (
            <button
              type="button"
              onClick={cancel}
              className="rounded-xl border border-ink-600 px-4 py-3 text-sm text-slate-300 transition hover:border-ink-500 hover:text-white"
            >
              Cancel
            </button>
          )}

          {tooShort && !running && prompt.length > 0 && (
            <span className="text-xs text-amber-300">
              A few more words — at least {MIN_PROMPT} characters.
            </span>
          )}
          {!running && !result && !error && (
            <span className="text-xs text-muted">Takes roughly 1–3 minutes.</span>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm"
          >
            <p className="font-medium text-red-300">Generation failed</p>
            <p className="mt-1 text-red-200/80">{error}</p>
            {errorCode === "unsubscribed" && (
              <Link
                href="/pricing"
                className="mt-3 inline-block rounded-lg bg-brand-500 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-brand-600"
              >
                View plans
              </Link>
            )}
            {errorCode === "unauthenticated" && (
              <Link
                href="/login"
                className="mt-3 inline-block rounded-lg bg-brand-500 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-brand-600"
              >
                Sign in
              </Link>
            )}
          </div>
        )}
      </section>

      {/* ---------------- Progress ---------------- */}
      {(running || result || agents.some((a) => a.state !== "pending")) && (
        <AgentTimeline agents={agents} running={running} />
      )}

      {/* ---------------- Result ---------------- */}
      {result && (
        <div ref={resultRef} className="scroll-mt-20 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-600 pt-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">
                Your {TARGETS[result.targetId].label}
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                Built in {(result.elapsedMs / 1000).toFixed(0)}s ·{" "}
                {result.totalTokens.toLocaleString()} tokens ·{" "}
                {result.notes?.verifierVerdict === "PASS"
                  ? "verifier passed with no changes"
                  : result.notes?.verifierVerdict === "FIXED"
                    ? "verifier applied corrections"
                    : "verified"}
              </p>
            </div>
          </div>

          {result.warnings.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <p className="text-sm font-medium text-amber-200">
                Worth a look before you use this
              </p>
              <ul className="mt-2 space-y-1.5 text-sm text-amber-100/80">
                {result.warnings.map((warning, index) => (
                  <li key={index} className="flex gap-2">
                    <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-400/70" />
                    <span>{warning}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <CodeBlock
            code={result.code}
            language={result.language}
            languageLabel={TARGETS[result.targetId].languageLabel}
            fileName={result.fileName}
          />

          <PasteGuide target={TARGETS[result.targetId]} />

          <div className="grid gap-4 lg:grid-cols-3">
            {result.notes?.whatThisDoes && (
              <div className="rounded-xl border border-ink-600 bg-ink-800/50 p-5">
                <h3 className="mb-2.5 text-sm font-semibold text-slate-100">What this does</h3>
                <Prose text={result.notes.whatThisDoes} />
              </div>
            )}
            {result.notes?.inputsToSetFirst && (
              <div className="rounded-xl border border-ink-600 bg-ink-800/50 p-5">
                <h3 className="mb-2.5 text-sm font-semibold text-slate-100">Inputs to set first</h3>
                <Prose text={result.notes.inputsToSetFirst} />
              </div>
            )}
            {(result.notes?.knownLimitations || result.notes?.remainingRisks) && (
              <div className="rounded-xl border border-ink-600 bg-ink-800/50 p-5">
                <h3 className="mb-2.5 text-sm font-semibold text-slate-100">Known limitations</h3>
                <Prose
                  text={[result.notes.knownLimitations, result.notes.remainingRisks]
                    .filter(Boolean)
                    .join("\n\n")}
                />
              </div>
            )}
          </div>

          <p className="rounded-xl border border-ink-600 bg-ink-850 p-4 text-xs leading-relaxed text-muted">
            <strong className="text-slate-300">Read this before you trade it.</strong> This file
            was written by language models. It has been reviewed by a debugger and a verifier, but
            that is not the same as being correct.{" "}
            {TARGETS[result.targetId].executes
              ? "It places orders. Run it in the Strategy Tester or on a demo account, check that entries, exits, stops and position sizes behave the way you expect, and only then consider real money."
              : "Check the plotted values against your own reading of the chart before you act on its signals."}{" "}
            Quant Tools gives no financial advice and makes no claim that this strategy is
            profitable.
          </p>
        </div>
      )}
    </div>
  );
}
