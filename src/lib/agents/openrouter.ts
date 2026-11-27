/**
 * Minimal OpenRouter chat-completions client.
 *
 * Deliberately dependency-free: one fetch, explicit timeout, explicit retry on
 * the transient statuses OpenRouter documents (429 / 5xx), and errors that say
 * what actually went wrong so the pipeline can surface them to the user.
 */

const DEFAULT_OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Override the endpoint with OPENROUTER_BASE_URL to route through a gateway,
 * a corporate proxy, or a local stub during testing.
 */
function endpoint(): string {
  const base = process.env.OPENROUTER_BASE_URL;
  if (!base) return DEFAULT_OPENROUTER_URL;
  return `${base.replace(/\/+$/, "")}/chat/completions`;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Abort the whole call after this many ms. */
  timeoutMs?: number;
  /** Retries on 429/5xx. Default 2 (so up to 3 attempts). */
  retries?: number;
  signal?: AbortSignal;
}

export interface CompletionResult {
  text: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
}

export class OpenRouterError extends Error {
  readonly status: number | undefined;
  readonly retryable: boolean;

  constructor(message: string, status?: number, retryable = false) {
    super(message);
    this.name = "OpenRouterError";
    this.status = status;
    this.retryable = retryable;
  }
}

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string; code?: number | string };
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status === 502 || status === 503 || status === 504;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new OpenRouterError("Generation cancelled", undefined, false));
      },
      { once: true },
    );
  });
}

/** Reads the API key at call time so a missing key is a runtime error, not a build error. */
export function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new OpenRouterError(
      "OPENROUTER_API_KEY is not set on the server. Add it to your environment and restart.",
    );
  }
  return key;
}

export async function complete(options: CompletionOptions): Promise<CompletionResult> {
  const {
    model,
    messages,
    temperature = 0.2,
    maxTokens = 8000,
    timeoutMs = 180_000,
    retries = 2,
    signal,
  } = options;

  const apiKey = getApiKey();
  let lastError: OpenRouterError | undefined;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (signal?.aborted) {
      throw new OpenRouterError("Generation cancelled", undefined, false);
    }

    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
    const onOuterAbort = () => timeoutController.abort();
    signal?.addEventListener("abort", onOuterAbort, { once: true });

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      };
      // OpenRouter uses these for attribution on its model-usage dashboard.
      if (process.env.OPENROUTER_SITE_URL) {
        headers["HTTP-Referer"] = process.env.OPENROUTER_SITE_URL;
      }
      if (process.env.OPENROUTER_APP_NAME) {
        headers["X-Title"] = process.env.OPENROUTER_APP_NAME;
      }

      const response = await fetch(endpoint(), {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
        signal: timeoutController.signal,
      });

      if (!response.ok) {
        const bodyText = await response.text().catch(() => "");
        let detail = bodyText.slice(0, 400);
        try {
          const parsed = JSON.parse(bodyText) as OpenRouterResponse;
          if (parsed.error?.message) detail = parsed.error.message;
        } catch {
          /* keep the raw text */
        }
        const retryable = isRetryableStatus(response.status);
        throw new OpenRouterError(
          `OpenRouter returned ${response.status}: ${detail || response.statusText}`,
          response.status,
          retryable,
        );
      }

      const data = (await response.json()) as OpenRouterResponse;
      if (data.error?.message) {
        throw new OpenRouterError(`OpenRouter error: ${data.error.message}`);
      }

      const text = data.choices?.[0]?.message?.content ?? "";
      if (!text.trim()) {
        throw new OpenRouterError(
          `Model ${model} returned an empty response.`,
          undefined,
          true,
        );
      }

      return {
        text,
        model: data.model ?? model,
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
      };
    } catch (error) {
      if (signal?.aborted) {
        throw new OpenRouterError("Generation cancelled", undefined, false);
      }
      if (error instanceof OpenRouterError) {
        lastError = error;
        if (!error.retryable || attempt === retries) throw error;
      } else if (error instanceof Error && error.name === "AbortError") {
        lastError = new OpenRouterError(
          `Model ${model} timed out after ${Math.round(timeoutMs / 1000)}s.`,
          408,
          true,
        );
        if (attempt === retries) throw lastError;
      } else {
        // `fetch` reports almost every network problem as the same bare
        // "fetch failed", so unwrap `cause` — that is where the DNS, TLS or
        // connection-refused detail actually lives.
        const detail =
          error instanceof Error
            ? [error.message, (error.cause as Error | undefined)?.message]
                .filter(Boolean)
                .join(" — ")
            : String(error);
        lastError = new OpenRouterError(
          `Could not reach OpenRouter: ${detail}`,
          undefined,
          true,
        );
        if (attempt === retries) throw lastError;
      }

      // Exponential backoff with a little jitter.
      await sleep(600 * 2 ** attempt + Math.floor(Math.random() * 250), signal);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onOuterAbort);
    }
  }

  throw lastError ?? new OpenRouterError("OpenRouter request failed.");
}
