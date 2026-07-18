import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import {
  CallOutcomeSchema,
  CallRequestSchema,
  TranscriptTurnSchema,
} from "@/lib/contracts";
import { createDemoOutcome } from "@/lib/demo";
import { getOpenAIClient, PLANNING_MODEL } from "@/lib/openai";

const OutcomeRequestSchema = z.object({
  request: CallRequestSchema,
  transcript: z.array(TranscriptTurnSchema).max(120),
  status: z.enum(["completed", "partial", "ended"]),
});

export async function POST(request: Request) {
  const parsed = OutcomeRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "The call outcome payload is invalid." }, { status: 400 });
  }

  const openai = getOpenAIClient();
  if (!openai) {
    return Response.json(
      createDemoOutcome(parsed.data.request, parsed.data.transcript, parsed.data.status),
    );
  }

  try {
    const response = await openai.responses.parse({
      model: PLANNING_MODEL,
      reasoning: { effort: "low" },
      store: false,
      safety_identifier: "call-assist-build-week-demo",
      instructions: `Turn the supplied phone call transcript into a factual, concise outcome for the user. Distinguish confirmed details from unresolved items. Do not infer that a reservation or commitment was completed unless the transcript contains the user's explicit approval and the business's confirmation. Never include the full transcript in the summary. Set transcriptDiscarded to true.`,
      input: JSON.stringify(parsed.data),
      text: { format: zodTextFormat(CallOutcomeSchema, "call_outcome") },
    });

    if (!response.output_parsed) throw new Error("The outcome response was empty.");
    return Response.json({ ...response.output_parsed, transcriptDiscarded: true, mode: "ai" });
  } catch (error) {
    console.error("OpenAI outcome generation failed", error);
    return Response.json(
      { error: "The structured outcome could not be generated." },
      { status: 502 },
    );
  }
}
