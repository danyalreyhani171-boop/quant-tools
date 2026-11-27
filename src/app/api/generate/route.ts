import { AuthError, requireSubscriber } from "@/lib/auth";
import { countRecentGenerations, failGeneration, finishGeneration, startGeneration } from "@/lib/db";
import { runPipeline, type PipelineEvent } from "@/lib/agents/pipeline";
import { GENERATION_LIMIT, GENERATION_WINDOW_MINUTES } from "@/lib/rateLimit";
import { getTarget, isTargetId } from "@/lib/targets";

export const runtime = "nodejs";
// The pipeline makes six sequential model calls, so give it room. On Vercel
// this requires a plan that allows long function durations; self-hosted Node
// has no such limit.
export const maxDuration = 800;

const MIN_PROMPT = 15;
const MAX_PROMPT = 6000;

function sseChunk(event: PipelineEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function errorResponse(message: string, status: number, code?: string) {
  return Response.json({ error: message, code }, { status });
}

export async function POST(request: Request) {
  // ---- authorisation ----
  let user;
  try {
    user = await requireSubscriber();
  } catch (error) {
    if (error instanceof AuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    console.error("generate auth failed", error);
    return errorResponse("Could not verify your subscription. Please try again.", 500);
  }

  // ---- input validation ----
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid request body.", 400);
  }

  const { prompt, target: targetId } = (body ?? {}) as {
    prompt?: unknown;
    target?: unknown;
  };

  if (!isTargetId(targetId)) {
    return errorResponse("Please choose one of the four code outputs.", 400);
  }
  if (typeof prompt !== "string") {
    return errorResponse("Please describe your strategy.", 400);
  }

  const trimmed = prompt.trim();
  if (trimmed.length < MIN_PROMPT) {
    return errorResponse(
      `Please describe your strategy in a bit more detail (at least ${MIN_PROMPT} characters).`,
      400,
    );
  }
  if (trimmed.length > MAX_PROMPT) {
    return errorResponse(
      `That description is too long (${trimmed.length} characters, limit ${MAX_PROMPT}).`,
      400,
    );
  }

  // ---- quota ----
  try {
    const used = await countRecentGenerations(user.id, GENERATION_WINDOW_MINUTES);
    if (used >= GENERATION_LIMIT) {
      return errorResponse(
        `You have used all ${GENERATION_LIMIT} generations for this hour. This cap is here to keep costs sane — it resets within the hour.`,
        429,
        "quota",
      );
    }
  } catch (error) {
    console.error("quota check failed", error);
    return errorResponse("Could not check your usage. Please try again.", 500);
  }

  const target = getTarget(targetId);
  const generationId = crypto.randomUUID();

  try {
    await startGeneration(generationId, user.id, target.id, trimmed);
  } catch (error) {
    console.error("could not record generation", error);
    return errorResponse("Could not start the generation. Please try again.", 500);
  }

  // ---- stream ----
  const encoder = new TextEncoder();
  // The client disconnecting should stop the model calls, not leave six
  // requests running against OpenRouter for nothing.
  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort(), { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let settled = false;

      const send = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          /* client already gone */
        }
      };

      // Proxies and load balancers close idle connections; a comment line every
      // 15s keeps the stream alive through the slow code-writing stages.
      const heartbeat = setInterval(() => send(": keepalive\n\n"), 15_000);

      try {
        for await (const event of runPipeline({
          request: trimmed,
          target,
          signal: abort.signal,
        })) {
          send(sseChunk(event));

          if (event.type === "complete") {
            settled = true;
            try {
              await finishGeneration(generationId, {
                code: event.code,
                notes: event.notes,
                warnings: event.warnings,
                totalTokens: event.totalTokens,
              });
            } catch (error) {
              console.error("could not save generation", error);
            }
          } else if (event.type === "error") {
            settled = true;
            try {
              await failGeneration(generationId, event.message);
            } catch (error) {
              console.error("could not record failure", error);
            }
          }
        }

        if (!settled) {
          const message = abort.signal.aborted
            ? "Generation cancelled."
            : "The generation ended unexpectedly. Please try again.";
          send(sseChunk({ type: "error", message }));
          await failGeneration(generationId, message).catch(() => {});
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "The generation failed unexpectedly.";
        console.error("pipeline crashed", error);
        send(sseChunk({ type: "error", message }));
        await failGeneration(generationId, message).catch(() => {});
      } finally {
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Tells nginx not to buffer the stream.
      "X-Accel-Buffering": "no",
    },
  });
}
