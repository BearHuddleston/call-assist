import { zodTextFormat } from "openai/helpers/zod";
import { CallPlanSchema, CallRequestSchema } from "@/lib/contracts";
import { createDemoPlan } from "@/lib/demo";
import { getOpenAIClient, PLANNING_MODEL } from "@/lib/openai";
import { screenCallRequest } from "@/lib/safety";

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

  try {
    const response = await openai.responses.parse({
      model: PLANNING_MODEL,
      reasoning: { effort: "medium" },
      store: false,
      safety_identifier: "call-assist-build-week-demo",
      instructions: `Create a conservative, reviewable plan for one user-initiated, low-risk phone call. The caller is an AI accessibility assistant for a Deaf or hard-of-hearing user. Open with accurate AI disclosure and ask consent before live transcription continues. Use only the supplied facts. Never navigate IVRs, accept charges, make a payment, disclose sensitive data, or make a commitment without an approval gate. Include a stop condition for any unsupported or high-risk turn.`,
      input: JSON.stringify(parsed.data),
      text: { format: zodTextFormat(CallPlanSchema, "call_plan") },
    });

    if (!response.output_parsed) throw new Error("The plan response was empty.");
    return Response.json({ ...response.output_parsed, mode: "ai" });
  } catch (error) {
    console.error("OpenAI call planning failed", error);
    return Response.json(
      { error: "The AI plan could not be generated. Try again or enable demo mode." },
      { status: 502 },
    );
  }
}
