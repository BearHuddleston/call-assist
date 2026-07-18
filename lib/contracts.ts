import { z } from "zod";

export const CallRequestSchema = z.object({
  destinationId: z.string().min(1),
  destinationName: z.string().min(1).max(120),
  phoneNumber: z.string().min(7).max(30),
  goal: z.string().min(8).max(800),
  facts: z.string().max(1600),
  boundaries: z.array(z.string().min(1).max(240)).min(1).max(12),
  userConfirmedLowRisk: z.literal(true),
});

export const CallPlanSchema = z.object({
  destination: z.string(),
  objective: z.string(),
  openingScript: z.string(),
  successCriteria: z.array(z.string()).min(1),
  conversationPath: z
    .array(
      z.object({
        label: z.string(),
        detail: z.string(),
      }),
    )
    .min(2),
  approvedFacts: z.array(z.string()),
  approvalGates: z.array(z.string()),
  stopConditions: z.array(z.string()).min(1),
  mode: z.enum(["ai", "demo"]),
});

export const TranscriptTurnSchema = z.object({
  id: z.string(),
  speaker: z.enum(["agent", "business", "user", "system"]),
  text: z.string(),
});

export const CallOutcomeSchema = z.object({
  status: z.enum(["completed", "partial", "ended"]),
  headline: z.string(),
  summary: z.string(),
  confirmed: z.array(z.string()),
  unresolved: z.array(z.string()),
  nextSteps: z.array(z.string()),
  referenceNumber: z.string().nullable(),
  transcriptDiscarded: z.boolean(),
  mode: z.enum(["ai", "demo"]),
});

export const StartCallSchema = z.object({
  request: CallRequestSchema,
  plan: CallPlanSchema,
});

export const CallCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("guidance.say"), text: z.string().min(1).max(500) }),
  z.object({ type: z.literal("guidance.correct"), text: z.string().min(1).max(500) }),
  z.object({ type: z.literal("call.pause") }),
  z.object({ type: z.literal("call.resume") }),
  z.object({ type: z.literal("call.end") }),
  z.object({
    type: z.literal("approval.resolve"),
    approvalId: z.string().uuid(),
    approved: z.boolean(),
  }),
]);

export const LiveCallEventSchema = z.object({
  cursor: z.number().int().positive(),
  at: z.string(),
  type: z.enum([
    "call.state",
    "caption.final",
    "approval.requested",
    "approval.resolved",
    "call.error",
  ]),
  data: z.record(z.string(), z.unknown()),
});

export const LiveCallEventsResponseSchema = z.object({
  callId: z.string().uuid(),
  status: z.string(),
  events: z.array(LiveCallEventSchema),
});

export const LiveCallStartResponseSchema = z.object({
  callId: z.string().uuid(),
  status: z.string(),
});

export const LiveServiceStatusSchema = z.object({
  available: z.boolean(),
  mode: z.enum(["live", "demo"]),
});

export type CallRequest = z.infer<typeof CallRequestSchema>;
export type CallPlan = z.infer<typeof CallPlanSchema>;
export type TranscriptTurn = z.infer<typeof TranscriptTurnSchema>;
export type CallOutcome = z.infer<typeof CallOutcomeSchema>;
export type StartCall = z.infer<typeof StartCallSchema>;
export type CallCommand = z.infer<typeof CallCommandSchema>;
export type LiveCallEvent = z.infer<typeof LiveCallEventSchema>;
export type LiveCallEventsResponse = z.infer<typeof LiveCallEventsResponseSchema>;
export type LiveCallStartResponse = z.infer<typeof LiveCallStartResponseSchema>;
