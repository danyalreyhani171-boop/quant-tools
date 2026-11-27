"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { TOKEN_CLASS, tokenize } from "@/lib/highlight";

interface CodeBlockProps {
  code: string;
  language: "pine" | "mql5";
  languageLabel: string;
  fileName: string;
}

/** Splits tokens into lines so each line can carry a gutter number. */
function toLines(code: string, language: "pine" | "mql5") {
  const tokens = tokenize(code, language);
  const lines: { kind: keyof typeof TOKEN_CLASS; value: string }[][] = [[]];

  for (const token of tokens) {
    const parts = token.value.split("\n");
    parts.forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part.length > 0) {
        lines[lines.length - 1]!.push({ kind: token.kind, value: part });
      }
    });
  }

  return lines;
}

export default function CodeBlock({
  code,
  language,
  languageLabel,
  fileName,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [wrap, setWrap] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackRef = useRef<HTMLTextAreaElement>(null);

  const lines = useMemo(() => toLines(code, language), [code, language]);
  const lineCount = lines.length;
  const gutterWidth = `${String(lineCount).length + 1}ch`;

  const flash = useCallback((ok: boolean) => {
    setCopied(ok);
    setCopyFailed(!ok);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => {
      setCopied(false);
      setCopyFailed(false);
    }, 2200);
  }, []);

  const copy = useCallback(async () => {
    // The async clipboard API needs a secure context, so keep a selection-based
    // fallback for http:// deployments and older browsers.
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(code);
        flash(true);
        return;
      }
      throw new Error("clipboard unavailable");
    } catch {
      const area = fallbackRef.current;
      if (!area) {
        flash(false);
        return;
      }
      area.value = code;
      area.removeAttribute("aria-hidden");
      area.select();
      area.setSelectionRange(0, code.length);
      const ok = document.execCommand?.("copy") ?? false;
      area.setAttribute("aria-hidden", "true");
      window.getSelection()?.removeAllRanges();
      flash(ok);
    }
  }, [code, flash]);

  const download = useCallback(() => {
    const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }, [code, fileName]);

  return (
    <div className="overflow-hidden rounded-xl border border-ink-600 bg-ink-950">
      {/* Chrome */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-600 bg-ink-800/80 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="rounded-md bg-brand-500/15 px-2 py-0.5 text-xs font-medium text-brand-300 ring-1 ring-brand-500/25">
            {languageLabel}
          </span>
          <span className="truncate font-mono text-xs text-muted">{fileName}</span>
          <span className="hidden text-xs text-ink-500 sm:inline">
            {lineCount} line{lineCount === 1 ? "" : "s"}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setWrap((w) => !w)}
            aria-pressed={wrap}
            className="rounded-md px-2 py-1.5 text-xs text-slate-400 transition hover:bg-ink-700 hover:text-white"
          >
            {wrap ? "No wrap" : "Wrap"}
          </button>
          <button
            type="button"
            onClick={download}
            className="rounded-md px-2 py-1.5 text-xs text-slate-400 transition hover:bg-ink-700 hover:text-white"
          >
            Download
          </button>
          <button
            type="button"
            onClick={copy}
            aria-live="polite"
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              copied
                ? "bg-emerald-500 text-white"
                : copyFailed
                  ? "bg-red-500 text-white"
                  : "bg-brand-500 text-white hover:bg-brand-600"
            }`}
          >
            {copied ? (
              <>
                <svg viewBox="0 0 24 24" className="size-3.5" fill="none" strokeWidth="3">
                  <path
                    d="M4 12.5 9 17.5 20 6.5"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Copied
              </>
            ) : copyFailed ? (
              "Press Ctrl+C"
            ) : (
              <>
                <svg viewBox="0 0 24 24" className="size-3.5" fill="none" strokeWidth="2">
                  <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" />
                  <path
                    d="M15 5H6a1 1 0 0 0-1 1v9"
                    stroke="currentColor"
                    strokeLinecap="round"
                  />
                </svg>
                Copy code
              </>
            )}
          </button>
        </div>
      </div>

      {/* Code */}
      <div className="thin-scroll max-h-[32rem] overflow-auto">
        <pre
          className={`min-w-full p-0 font-mono text-[13px] leading-[1.55] ${
            wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"
          }`}
        >
          <code className="block">
            {lines.map((tokens, index) => (
              <span key={index} className="flex">
                <span
                  aria-hidden
                  className="sticky left-0 shrink-0 select-none border-r border-ink-700/60 bg-ink-950 px-3 text-right text-ink-500"
                  style={{ width: `calc(${gutterWidth} + 1.5rem)` }}
                >
                  {index + 1}
                </span>
                <span className={`px-4 ${wrap ? "min-w-0 flex-1" : ""}`}>
                  {tokens.length === 0 ? (
                    "​"
                  ) : (
                    tokens.map((token, tokenIndex) => (
                      <span key={tokenIndex} className={TOKEN_CLASS[token.kind]}>
                        {token.value}
                      </span>
                    ))
                  )}
                </span>
              </span>
            ))}
          </code>
        </pre>
      </div>

      {/* Hidden target for the execCommand copy fallback. */}
      <textarea
        ref={fallbackRef}
        aria-hidden="true"
        tabIndex={-1}
        readOnly
        className="pointer-events-none absolute size-px opacity-0"
      />
    </div>
  );
}
