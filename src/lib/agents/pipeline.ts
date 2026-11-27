import { AGENTS, AGENT_COUNT, type AgentContext, type AgentDefinition } from "./prompts";
import { complete, OpenRouterError } from "./openrouter";
import {
  extractCode,
  extractSection,
  extractVerdict,
  normaliseCode,
  sanityCheck,
} from "./extract";
import type { Target } from "@/lib/targets";

export const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

/** Fast, cheap model for the two spec-writing stages; strong model for code stages. */
const FALLBACK_MODELS: Record<string, string> = {
  architect: "OPENROUTER_MODEL_PLANNING",
  risk: "OPENROUTER_MODEL_PLANNING",
  coder: "OPENROUTER_MODEL_CODING",
  debugger: "OPENROUTER_MODEL_CODING",
  verifier: "OPENROUTER_MODEL_CODING",
  finalizer: "OPENROUTER_MODEL_CODING",
};

export function modelFor(agent: AgentDefinition): string {
  const specific = process.env[agent.modelEnvVar];
  if (specific) return specific;
  const tierVar = FALLBACK_MODELS[agent.id];
  const tier = tierVar ? process.env[tierVar] : undefined;
  if (tier) return tier;
  return process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
}

/** Which `### Heading` each code-producing agent is told to put its file under. */
const CODE_HEADINGS: Record<string, readonly string[]> = {
  coder: [],
  debugger: ["Corrected file"],
  verifier: ["Verified file"],
  finalizer: ["Final file"],
};

export type PipelineEvent =
  | { type: "start"; totalAgents: number; target: string; runId: string }
  | {
      type: "agent_start";
      index: number;
      id: string;
      name: string;
      description: string;
      model: string;
    }
  | {
      type: "agent_done";
      index: number;
      id: string;
      name: string;
      /** Short human-readable summary of what the agent concluded. */
      summary: string;
      promptTokens: number;
      completionTokens: number;
      elapsedMs: number;
    }
  | { type: "agent_error"; index: number; id: string; name: string; message: string }
  | {
      type: "complete";
      code: string;
      language: "pine" | "mql5";
      fileName: string;
      notes: GenerationNotes;
      warnings: string[];
      totalTokens: number;
      elapsedMs: number;
    }
  | { type: "error"; message: string };

export interface GenerationNotes {
  whatThisDoes: string | null;
  inputsToSetFirst: string | null;
  knownLimitations: string | null;
  verifierVerdict: "PASS" | "FIXED" | "UNKNOWN";
  remainingRisks: string | null;
}

export interface PipelineInput {
  request: string;
  target: Target;
  signal?: AbortSignal;
}

export interface PipelineResult {
  code: string;
  notes: GenerationNotes;
  warnings: string[];
  totalTokens: number;
}

/** Trims an agent's prose down to something that fits a UI timeline row. */
function summarise(agent: AgentDefinition, text: string): string {
  if (agent.id === "architect") {
    const name = extractSection(text, "Strategy Name");
    const summary = extractSection(text, "One-line Summary");
    const first = (name ?? summary ?? "").split("\n")[0]?.replace(/^[#\s*-]+/, "").trim();
    if (first) return `Spec written: ${first}`;
    return "Specification written";
  }
  if (agent.id === "risk") {
    const inputs = extractSection(text, "Risk Inputs");
    const rows = inputs ? inputs.split("\n").filter((l) => /^\s*\|/.test(l)).length - 2 : 0;
    return rows > 0 ? `Risk layer defined (${rows} inputs)` : "Risk layer defined";
  }
  if (agent.id === "coder") {
    return "Draft written";
  }
  if (agent.id === "debugger") {
    const issues = extractSection(text, "Issues found");
    if (!issues) return "Reviewed";
    if (/^\s*(none|no issues)/i.test(issues)) return "No issues found";
    const count = (issues.match(/^\s*\d+[.)]/gm) ?? []).length;
    return count > 0 ? `${count} issue${count === 1 ? "" : "s"} fixed` : "Issues fixed";
  }
  if (agent.id === "verifier") {
    const verdict = extractVerdict(text);
    if (verdict === "PASS") return "Verified — no changes needed";
    if (verdict === "FIXED") return "Verified — corrections applied";
    return "Verified";
  }
  return "Final file ready";
}

/**
 * Runs the six agents in sequence, yielding an event per state change.
 *
 * Each code-producing stage hands its file to the next. If a stage returns
 * something we cannot parse as code, the previous good file is carried forward
 * and a warning is recorded rather than failing the whole run — losing a
 * polish pass is much better than losing the generation.
 */
export async function* runPipeline(
  input: PipelineInput,
): AsyncGenerator<PipelineEvent, void, undefined> {
  const { request, target, signal } = input;
  const runId = crypto.randomUUID();
  const startedAt = Date.now();

  const previous: Record<string, string> = {};
  const warnings: string[] = [];
  let code = "";
  let totalTokens = 0;

  yield { type: "start", totalAgents: AGENT_COUNT, target: target.id, runId };

  for (let index = 0; index < AGENTS.length; index += 1) {
    const agent = AGENTS[index]!;
    const model = modelFor(agent);
    const agentStart = Date.now();

    yield {
      type: "agent_start",
      index,
      id: agent.id,
      name: agent.name,
      description: agent.description,
      model,
    };

    const ctx: AgentContext = { target, request, previous, code };

    let text: string;
    try {
      const result = await complete({
        model,
        messages: [
          { role: "system", content: agent.system(target) },
          { role: "user", content: agent.user(ctx) },
        ],
        temperature: agent.temperature,
        maxTokens: agent.maxTokens,
        signal,
      });
      text = result.text;
      totalTokens += result.promptTokens + result.completionTokens;

      previous[agent.id] = text;

      if (agent.producesCode) {
        const extracted = extractCode(text, target.language, CODE_HEADINGS[agent.id] ?? []);
        if (extracted) {
          code = normaliseCode(extracted);
        } else if (code) {
          warnings.push(
            `${agent.name} did not return a readable code block, so the previous version was kept.`,
          );
        } else {
          yield {
            type: "agent_error",
            index,
            id: agent.id,
            name: agent.name,
            message: `${agent.name} did not return any usable code.`,
          };
          yield {
            type: "error",
            message:
              "The code writer did not return a usable file. This is usually a transient model issue — please try again.",
          };
          return;
        }
      }

      yield {
        type: "agent_done",
        index,
        id: agent.id,
        name: agent.name,
        summary: summarise(agent, text),
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        elapsedMs: Date.now() - agentStart,
      };
    } catch (error) {
      const message =
        error instanceof OpenRouterError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error);

      yield { type: "agent_error", index, id: agent.id, name: agent.name, message };

      // The last three stages are quality passes. If one fails but we already
      // have a complete file, finish the run with a warning instead of
      // throwing away work the user has waited minutes for.
      const isOptionalPolish =
        (agent.id === "debugger" || agent.id === "verifier" || agent.id === "finalizer") &&
        code.length > 0;

      if (isOptionalPolish) {
        warnings.push(`${agent.name} could not run (${message}). Its pass was skipped.`);
        continue;
      }

      yield { type: "error", message };
      return;
    }
  }

  const check = sanityCheck(code, target.language);
  if (!check.ok) warnings.push(...check.problems);

  const finalText = previous["finalizer"] ?? "";
  const verifierText = previous["verifier"] ?? "";

  const notes: GenerationNotes = {
    whatThisDoes: extractSection(finalText, "What this does"),
    inputsToSetFirst: extractSection(finalText, "Inputs to set first"),
    knownLimitations: extractSection(finalText, "Known limitations"),
    verifierVerdict: verifierText ? extractVerdict(verifierText) : "UNKNOWN",
    remainingRisks: extractSection(verifierText, "Remaining risks"),
  };

  yield {
    type: "complete",
    code,
    language: target.language,
    fileName: target.fileName,
    notes,
    warnings,
    totalTokens,
    elapsedMs: Date.now() - startedAt,
  };
}

/** Non-streaming convenience wrapper, used by tests and the JSON fallback route. */
export async function runPipelineToCompletion(input: PipelineInput): Promise<PipelineResult> {
  let result: PipelineResult | null = null;
  let failure: string | null = null;

  for await (const event of runPipeline(input)) {
    if (event.type === "complete") {
      result = {
        code: event.code,
        notes: event.notes,
        warnings: event.warnings,
        totalTokens: event.totalTokens,
      };
    } else if (event.type === "error") {
      failure = event.message;
    }
  }

  if (failure) throw new Error(failure);
  if (!result) throw new Error("The generation pipeline produced no result.");
  return result;
}
