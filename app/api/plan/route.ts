import { zodTextFormat } from "openai/helpers/zod";
import { CallPlanSchema, CallRequestSchema } from "@/lib/contracts";
import { createDemoPlan } from "@/lib/demo";
import {
  getOpenAIClient,
  getPlanningMode,
  PLANNING_MODEL,
  PLANNING_REASONING_EFFORT,
} from "@/lib/openai";
import { CALL_PLAN_INSTRUCTIONS, enforcePlanBoundaries } from "@/lib/prompts";
import { screenCallRequest } from "@/lib/safety";

const PLAN_REQUEST_TIMEOUT_MS = 60_000;
const PLAN_MAX_OUTPUT_TOKENS = 1_600;

export function GET() {
  return Response.json(
    { mode: getPlanningMode() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const parsed = CallRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Please complete the call goal, facts, and safety confirmation." },
      { status: 400 },
    );
  }

  const safety = screenCallRequest(parsed.data, process.env.CALL_ASSIST_ALLOWLIST);
  if (!safety.allowed) {
    return Response.json({ error: safety.reasons.join(" ") }, { status: 400 });
  }

  const openai = getOpenAIClient();
  if (!openai) return Response.json(createDemoPlan(parsed.data));

  const requestStartedAt = Date.now();
  try {
    const response = await openai.responses.parse({
      model: PLANNING_MODEL,
      reasoning: { effort: PLANNING_REASONING_EFFORT },
      max_output_tokens: PLAN_MAX_OUTPUT_TOKENS,
      store: false,
      safety_identifier: "call-assist-build-week-demo",
      instructions: CALL_PLAN_INSTRUCTIONS,
      input: JSON.stringify(parsed.data),
      text: {
        format: zodTextFormat(CallPlanSchema, "call_plan"),
        verbosity: "low",
      },
    }, {
      signal: request.signal,
      timeout: PLAN_REQUEST_TIMEOUT_MS,
      maxRetries: 0,
    });

    if (!response.output_parsed) throw new Error("The plan response was empty.");
    const durationMs = Date.now() - requestStartedAt;
    console.info("OpenAI call planning completed", {
      model: PLANNING_MODEL,
      reasoningEffort: PLANNING_REASONING_EFFORT,
      durationMs,
      outputTokens: response.usage?.output_tokens,
    });
    return Response.json(
      {
        ...enforcePlanBoundaries(response.output_parsed, parsed.data),
        mode: "ai",
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "Server-Timing": `openai;dur=${durationMs}, total;dur=${durationMs}`,
        },
      },
    );
  } catch (error) {
    const errorText = error instanceof Error ? `${error.name} ${error.message}` : "";
    const timedOut = /timeout|timed out/i.test(errorText);
    if (!request.signal.aborted) console.error("OpenAI call planning failed", error);
    return Response.json(
      {
        error: timedOut
          ? "The plan took too long to generate. Your details are still here; please try again."
          : "The AI plan could not be generated. Try again or enable demo mode.",
      },
      { status: timedOut ? 504 : request.signal.aborted ? 499 : 502 },
    );
  }
}
