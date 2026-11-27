"use client";

export type AgentState = "pending" | "running" | "done" | "error" | "skipped";

export interface AgentRow {
  id: string;
  name: string;
  description: string;
  state: AgentState;
  summary?: string;
  model?: string;
  elapsedMs?: number;
  error?: string;
}

/** The six stages, shown before the run starts so the user knows what to expect. */
export const INITIAL_AGENTS: AgentRow[] = [
  {
    id: "architect",
    name: "Strategy Architect",
    description: "Turns your description into an unambiguous technical spec",
    state: "pending",
  },
  {
    id: "risk",
    name: "Risk Engineer",
    description: "Designs the stop loss, take profit and position sizing layer",
    state: "pending",
  },
  { id: "coder", name: "Code Writer", description: "Writes the complete file", state: "pending" },
  {
    id: "debugger",
    name: "Debugger",
    description: "Hunts compile errors, type errors and logic bugs",
    state: "pending",
  },
  {
    id: "verifier",
    name: "Verifier",
    description: "Audits the fixed code against the spec and platform rules",
    state: "pending",
  },
  {
    id: "finalizer",
    name: "Finaliser",
    description: "Polishes the file and writes your usage notes",
    state: "pending",
  },
];

function Marker({ state, index }: { state: AgentState; index: number }) {
  const base =
    "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold ring-1 transition";

  if (state === "done") {
    return (
      <span className={`${base} bg-emerald-500/15 text-emerald-300 ring-emerald-500/40`}>
        <svg viewBox="0 0 24 24" className="size-4" fill="none" strokeWidth="3">
          <path
            d="M5 12.5 10 17.5 19 7"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }
  if (state === "running") {
    return (
      <span
        className={`${base} pulse-ring bg-brand-500/20 text-brand-200 ring-brand-400/50`}
      >
        <svg viewBox="0 0 24 24" className="size-4 animate-spin" fill="none" strokeWidth="2.5">
          <circle cx="12" cy="12" r="8" stroke="currentColor" opacity="0.25" />
          <path d="M20 12a8 8 0 0 0-8-8" stroke="currentColor" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className={`${base} bg-red-500/15 text-red-300 ring-red-500/40`}>!</span>
    );
  }
  if (state === "skipped") {
    return <span className={`${base} bg-amber-500/10 text-amber-300 ring-amber-500/30`}>–</span>;
  }
  return <span className={`${base} bg-ink-800 text-ink-500 ring-ink-600`}>{index + 1}</span>;
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  return seconds < 60 ? `${seconds.toFixed(1)}s` : `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

export default function AgentTimeline({
  agents,
  running,
}: {
  agents: AgentRow[];
  running: boolean;
}) {
  const done = agents.filter((a) => a.state === "done").length;

  return (
    <section
      aria-label="Generation progress"
      className="rounded-xl border border-ink-600 bg-ink-800/50 p-4 sm:p-5"
    >
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-200">
          {running ? "Agents at work" : done === agents.length ? "Pipeline complete" : "The pipeline"}
        </h3>
        <span className="font-mono text-xs text-muted">
          {done}/{agents.length}
        </span>
      </div>

      <div
        className="mb-5 h-1 overflow-hidden rounded-full bg-ink-700"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={agents.length}
        aria-valuenow={done}
      >
        <div
          className="h-full rounded-full bg-brand-500 transition-[width] duration-500 ease-out"
          style={{ width: `${(done / agents.length) * 100}%` }}
        />
      </div>

      <ol className="space-y-0">
        {agents.map((agent, index) => (
          <li key={agent.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <Marker state={agent.state} index={index} />
              {index < agents.length - 1 && (
                <span
                  aria-hidden
                  className={`w-px flex-1 ${
                    agent.state === "done" ? "bg-emerald-500/30" : "bg-ink-600"
                  }`}
                />
              )}
            </div>

            <div className={`min-w-0 flex-1 ${index < agents.length - 1 ? "pb-5" : ""}`}>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span
                  className={`text-sm font-medium ${
                    agent.state === "pending" ? "text-slate-500" : "text-slate-100"
                  }`}
                >
                  {agent.name}
                </span>
                {agent.elapsedMs !== undefined && (
                  <span className="font-mono text-[11px] text-ink-500">
                    {formatElapsed(agent.elapsedMs)}
                  </span>
                )}
              </div>

              <p
                className={`mt-0.5 text-xs leading-relaxed ${
                  agent.state === "error"
                    ? "text-red-300"
                    : agent.state === "done"
                      ? "text-emerald-300/90"
                      : "text-muted"
                }`}
              >
                {agent.state === "error"
                  ? agent.error
                  : agent.state === "done"
                    ? (agent.summary ?? agent.description)
                    : agent.description}
              </p>

              {agent.model && agent.state !== "pending" && (
                <p className="mt-1 truncate font-mono text-[11px] text-ink-500">{agent.model}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
