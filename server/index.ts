import { randomUUID, timingSafeEqual } from "node:crypto";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import formbody from "@fastify/formbody";
import websocket from "@fastify/websocket";
import { TwilioRealtimeTransportLayer } from "@openai/agents-extensions";
import {
  RealtimeAgent,
  RealtimeSession,
  tool,
  type RealtimeItem,
} from "@openai/agents/realtime";
import twilio from "twilio";
import { z } from "zod";
import {
  CallCommandSchema,
  StartCallSchema,
  type CallPlan,
  type CallRequest,
  type LiveCallEvent,
} from "../lib/contracts";
import {
  approvalActionHasExplicitGate,
  approvalConflictsWithAbsoluteBoundary,
  buildAgentInstructions,
  commitmentViolatesProductScope,
  enforcePlanBoundaries,
  isAbsoluteBoundary,
  SUPPORTED_APPROVAL_ACTIONS,
  type SupportedApprovalAction,
} from "../lib/prompts";
import { screenCallRequest } from "../lib/safety";

const PORT = Number(process.env.TELEPHONY_PORT ?? 8788);
const HOST = process.env.TELEPHONY_HOST ?? "0.0.0.0";
const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-2.1";
const RETENTION_MS = 5 * 60 * 1000;
const ACTIVE_RETENTION_MS = 30 * 60 * 1000;
const TERMINAL_CALL_STATUSES = new Set([
  "ended",
  "completed",
  "failed",
  "busy",
  "no-answer",
  "canceled",
  "disconnected",
]);
const supportedApprovalActions = new Set<string>(SUPPORTED_APPROVAL_ACTIONS);

type PendingApproval = {
  item: Parameters<RealtimeSession["approve"]>[0];
  commitment: string;
};

type CallRecord = {
  id: string;
  request: CallRequest;
  plan: CallPlan;
  status: string;
  callSid?: string;
  events: LiveCallEvent[];
  nextCursor: number;
  seenCaptions: Map<string, string>;
  approvals: Map<string, PendingApproval>;
  session?: RealtimeSession;
  transport?: TwilioRealtimeTransportLayer;
  instructions?: string;
  cleanupTimer?: ReturnType<typeof setTimeout>;
};

const calls = new Map<string, CallRecord>();
const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function publicBaseUrl(): string {
  return requireEnv("TELEPHONY_PUBLIC_BASE_URL").replace(/\/$/, "");
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function isInternalRequestAuthorized(request: FastifyRequest): boolean {
  const token = process.env.CALL_ASSIST_SERVICE_TOKEN;
  const header = request.headers.authorization;
  return Boolean(token && header && safeEqual(header, `Bearer ${token}`));
}

async function requireInternalAuth(request: FastifyRequest, reply: FastifyReply) {
  if (!isInternalRequestAuthorized(request)) {
    return reply.code(401).send({ error: "Unauthorized." });
  }
}

function emit(record: CallRecord, type: LiveCallEvent["type"], data: Record<string, unknown>) {
  record.events.push({
    cursor: record.nextCursor++,
    at: new Date().toISOString(),
    type,
    data,
  });
  if (record.events.length > 500) record.events.splice(0, record.events.length - 500);
}

function serviceIsReady(): boolean {
  const publicUrl = process.env.TELEPHONY_PUBLIC_BASE_URL?.trim();
  return Boolean(
    process.env.OPENAI_API_KEY &&
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER &&
      publicUrl?.startsWith("https://") &&
      process.env.CALL_ASSIST_SERVICE_TOKEN,
  );
}

function scheduleCleanup(record: CallRecord, delay = RETENTION_MS) {
  if (record.cleanupTimer) clearTimeout(record.cleanupTimer);
  record.cleanupTimer = setTimeout(() => {
    record.session?.close();
    calls.delete(record.id);
  }, delay);
}

function parseToolArguments(value?: string): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function conflictsWithAbsoluteBoundary(record: CallRecord, commitment: string): boolean {
  return commitmentViolatesProductScope(commitment) || record.request.boundaries
    .filter(isAbsoluteBoundary)
    .some((boundary) => approvalConflictsWithAbsoluteBoundary(commitment, boundary));
}

async function endTwilioCall(record: CallRecord, reason: string) {
  if (record.callSid) {
    const client = twilio(requireEnv("TWILIO_ACCOUNT_SID"), requireEnv("TWILIO_AUTH_TOKEN"));
    await client.calls(record.callSid).update({ status: "completed" });
  }
  record.status = "ended";
  emit(record, "call.state", { status: "ended", reason });
  record.session?.close();
  scheduleCleanup(record);
}

function captionText(item: RealtimeItem): string | null {
  if (item.type !== "message" || item.role === "system" || item.status !== "completed") {
    return null;
  }
  const parts = item.content.flatMap((content) => {
    if (content.type === "input_text" || content.type === "output_text") return [content.text];
    if (content.type === "input_audio" || content.type === "output_audio") {
      return content.transcript ? [content.transcript] : [];
    }
    return [];
  });
  const text = parts.join(" ").trim();
  return text || null;
}

function publishCaptions(record: CallRecord, history: RealtimeItem[]) {
  for (const item of history) {
    const text = captionText(item);
    if (!text || record.seenCaptions.get(item.itemId) === text) continue;
    record.seenCaptions.set(item.itemId, text);
    emit(record, "caption.final", {
      id: item.itemId,
      speaker: item.type === "message" && item.role === "assistant" ? "agent" : "business",
      text,
    });
  }
}

function twilioSignatureIsValid(request: FastifyRequest, url: string, params: Record<string, string> = {}) {
  if (process.env.TWILIO_VALIDATE_SIGNATURES === "false") return true;
  const signatureHeader = request.headers["x-twilio-signature"];
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (!signature) return false;
  const authToken = requireEnv("TWILIO_AUTH_TOKEN");
  return (
    twilio.validateRequest(authToken, signature, url, params) ||
    twilio.validateRequest(authToken, signature, `${url}/`, params)
  );
}

await app.register(formbody);
await app.register(websocket);

app.get("/health", async () => ({ ok: true, ready: serviceIsReady() }));

app.post(
  "/internal/calls",
  { preHandler: requireInternalAuth },
  async (request, reply) => {
    const parsed = StartCallSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid call request." });

    const safety = screenCallRequest(parsed.data.request, process.env.CALL_ASSIST_ALLOWLIST);
    if (!safety.allowed) return reply.code(400).send({ error: safety.reasons.join(" ") });

    const baseUrl = publicBaseUrl();
    if (!baseUrl.startsWith("https://")) {
      return reply.code(500).send({ error: "TELEPHONY_PUBLIC_BASE_URL must use HTTPS." });
    }
    requireEnv("OPENAI_API_KEY");
    const accountSid = requireEnv("TWILIO_ACCOUNT_SID");
    const authToken = requireEnv("TWILIO_AUTH_TOKEN");
    const from = requireEnv("TWILIO_FROM_NUMBER");

    const id = randomUUID();
    const record: CallRecord = {
      id,
      request: parsed.data.request,
      plan: enforcePlanBoundaries(parsed.data.plan, parsed.data.request),
      status: "starting",
      events: [],
      nextCursor: 1,
      seenCaptions: new Map(),
      approvals: new Map(),
    };
    calls.set(id, record);
    emit(record, "call.state", { status: "starting" });
    scheduleCleanup(record, ACTIVE_RETENTION_MS);

    try {
      const response = new twilio.twiml.VoiceResponse();
      const connect = response.connect();
      const streamUrl = `${baseUrl.replace(/^https:/, "wss:")}/twilio/media/${id}`;
      const stream = connect.stream({ url: streamUrl });
      stream.parameter({ name: "callId", value: id });

      const client = twilio(accountSid, authToken);
      const call = await client.calls.create({
        from,
        to: parsed.data.request.phoneNumber,
        twiml: response.toString(),
        statusCallback: `${baseUrl}/twilio/status/${id}`,
        statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
        statusCallbackMethod: "POST",
      });
      record.callSid = call.sid;
      record.status = call.status;
      emit(record, "call.state", { status: call.status });
      return reply.code(201).send({ callId: id, status: call.status });
    } catch (error) {
      if (record.cleanupTimer) clearTimeout(record.cleanupTimer);
      calls.delete(id);
      request.log.error({ err: error }, "Failed to start Twilio call");
      return reply.code(502).send({ error: "Twilio could not start the call." });
    }
  },
);

app.get(
  "/internal/calls/:callId/events",
  { preHandler: requireInternalAuth },
  async (request, reply) => {
    const { callId } = request.params as { callId: string };
    const after = Number((request.query as { after?: string }).after ?? 0);
    const record = calls.get(callId);
    if (!record) return reply.code(404).send({ error: "Call not found." });
    return { callId, status: record.status, events: record.events.filter((event) => event.cursor > after) };
  },
);

app.delete(
  "/internal/calls/:callId/transcript",
  { preHandler: requireInternalAuth },
  async (request, reply) => {
    const { callId } = request.params as { callId: string };
    const record = calls.get(callId);
    if (!record) return reply.code(404).send({ error: "Call not found." });
    if (!TERMINAL_CALL_STATUSES.has(record.status)) {
      return reply.code(409).send({ error: "The active call transcript cannot be cleared." });
    }

    record.events = record.events.filter((event) => event.type !== "caption.final");
    record.seenCaptions.clear();
    record.approvals.clear();
    record.session?.close();
    record.session = undefined;
    record.transport = undefined;
    record.instructions = undefined;
    scheduleCleanup(record);
    return reply.send({ cleared: true });
  },
);

app.post(
  "/internal/calls/:callId/commands",
  { preHandler: requireInternalAuth },
  async (request, reply) => {
    const { callId } = request.params as { callId: string };
    const record = calls.get(callId);
    if (!record) return reply.code(404).send({ error: "Call not found." });
    const parsed = CallCommandSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid call command." });

    const command = parsed.data;
    if (command.type === "call.end") {
      if (record.status === "ended" || record.status === "completed") {
        return reply.code(202).send({ accepted: true });
      }
      await endTwilioCall(record, "Ended by the supervising user.");
    } else if (command.type === "call.pause") {
      if (!record.session || !record.transport || !record.instructions) {
        return reply.code(409).send({ error: "The live call is not ready for commands." });
      }
      record.session.interrupt();
      record.transport.updateSessionConfig({
        instructions: `${record.instructions}\n\nSUPERVISOR STATE: PAUSED. Do not speak until the supervisor resumes the call.`,
      });
      record.status = "paused";
      emit(record, "call.state", { status: "paused" });
    } else if (command.type === "call.resume") {
      if (!record.session || !record.transport || !record.instructions) {
        return reply.code(409).send({ error: "The live call is not ready for commands." });
      }
      record.transport.updateSessionConfig({ instructions: record.instructions });
      record.status = "live";
      emit(record, "call.state", { status: "live" });
    } else if (command.type === "guidance.say") {
      if (!record.session) {
        return reply.code(409).send({ error: "The live call is not ready for guidance." });
      }
      record.session.sendMessage(`Supervisor guidance: Say this naturally at the next safe opening: ${command.text}`);
    } else if (command.type === "guidance.correct") {
      if (!record.session) {
        return reply.code(409).send({ error: "The live call is not ready for guidance." });
      }
      record.session.interrupt();
      record.session.sendMessage(`Supervisor correction: Correct the record clearly: ${command.text}`);
    } else {
      const pending = record.approvals.get(command.approvalId);
      if (!pending || !record.session) {
        return reply.code(404).send({ error: "Approval request not found." });
      }
      if (command.approved) {
        if (conflictsWithAbsoluteBoundary(record, pending.commitment)) {
          await record.session.reject(pending.item, {
            message: "This conflicts with an absolute user boundary. Do not proceed.",
          });
          record.approvals.delete(command.approvalId);
          emit(record, "approval.resolved", {
            approvalId: command.approvalId,
            approved: false,
          });
          return reply.code(409).send({ error: "This action is blocked by an absolute boundary." });
        }
        await record.session.approve(pending.item);
      } else {
        await record.session.reject(pending.item, {
          message: "The supervising user declined this commitment. Do not proceed.",
        });
      }
      record.approvals.delete(command.approvalId);
      emit(record, "approval.resolved", {
        approvalId: command.approvalId,
        approved: command.approved,
      });
    }
    return reply.code(202).send({ accepted: true });
  },
);

app.post("/twilio/status/:callId", async (request, reply) => {
  const { callId } = request.params as { callId: string };
  const record = calls.get(callId);
  if (!record) return reply.code(404).send();
  const body = request.body as Record<string, string>;
  const url = `${publicBaseUrl()}${request.url}`;
  if (!twilioSignatureIsValid(request, url, body)) return reply.code(403).send();

  record.status = body.CallStatus ?? record.status;
  emit(record, "call.state", { status: record.status });
  if (TERMINAL_CALL_STATUSES.has(record.status)) {
    record.session?.close();
    scheduleCleanup(record);
  } else {
    scheduleCleanup(record, ACTIVE_RETENTION_MS);
  }
  return reply.code(204).send();
});

app.get("/twilio/media/:callId", { websocket: true }, (socket, request) => {
  const { callId } = request.params as { callId: string };
  const record = calls.get(callId);
  const streamUrl = `${publicBaseUrl().replace(/^https:/, "wss:")}${request.url}`;
  if (!record || !twilioSignatureIsValid(request, streamUrl)) {
    socket.close(1008, "Unauthorized");
    return;
  }

  const instructions = buildAgentInstructions(record.request, record.plan);
  record.instructions = instructions;

  const approvalTool = tool({
    name: "request_user_approval",
    description: "Pause only before an otherwise-permitted no-payment reservation, appointment, registration, or cancellation and ask the supervising user to approve it. Never use approval for a payment, purchase, subscription, deposit, sensitive disclosure, ordinary information gathering, unsupported action, or to override a Do not or Never boundary.",
    parameters: z.object({
      action: z.enum(["reservation", "appointment", "registration", "cancellation"])
        .describe("The supported low-risk action being proposed."),
      commitment: z.string().describe("The exact commitment the business is asking for."),
      reason: z.string().describe("Why approval is required now."),
      hasChargeOrPurchase: z.boolean()
        .describe("True if the proposal includes any fee, charge, deposit, payment, purchase, order, or subscription."),
    }),
    needsApproval: true,
    execute: async ({ commitment }) => `The supervising user approved: ${commitment}`,
  });

  const endCallTool = tool({
    name: "end_call",
    description: "End the phone call after declined transcription consent, an unsupported high-risk request, or a completed closing.",
    parameters: z.object({ reason: z.string() }),
    execute: async ({ reason }) => {
      await endTwilioCall(record, reason);
      return "The call has ended.";
    },
  });

  const agent = new RealtimeAgent({
    name: "Call Assist",
    voice: process.env.OPENAI_REALTIME_VOICE ?? "marin",
    instructions,
    tools: [approvalTool, endCallTool],
  });
  const transport = new TwilioRealtimeTransportLayer({ twilioWebSocket: socket });
  const session = new RealtimeSession(agent, {
    transport,
    model: REALTIME_MODEL,
    historyStoreAudio: false,
    tracingDisabled: process.env.OPENAI_TRACING_DISABLED !== "false",
    config: {
      outputModalities: ["audio"],
      reasoning: { effort: "medium" },
      audio: {
        input: {
          transcription: { model: "gpt-4o-mini-transcribe" },
          noiseReduction: { type: "far_field" },
          turnDetection: {
            type: "semantic_vad",
            eagerness: "low",
            createResponse: true,
            interruptResponse: true,
          },
        },
        output: { voice: process.env.OPENAI_REALTIME_VOICE ?? "marin" },
      },
    },
  });
  record.transport = transport;
  record.session = session;

  session.on("history_updated", (history) => publishCaptions(record, history));
  session.on("tool_approval_requested", (_context, _agent, approvalRequest) => {
    if (approvalRequest.type !== "function_approval") return;
    const approvalId = randomUUID();
    const args = parseToolArguments(approvalRequest.approvalItem.arguments);
    const commitment = typeof args.commitment === "string" ? args.commitment : "A call commitment";
    const action = typeof args.action === "string" ? args.action : "";
    if (
      !supportedApprovalActions.has(action) ||
      !approvalActionHasExplicitGate(
        action as SupportedApprovalAction,
        record.plan.approvalGates,
      ) ||
      args.hasChargeOrPurchase !== false ||
      conflictsWithAbsoluteBoundary(record, commitment)
    ) {
      void session.reject(approvalRequest.approvalItem, {
        message: "This action is outside the supported approval scope or conflicts with an absolute user boundary. Do not proceed.",
      });
      return;
    }
    record.approvals.set(approvalId, { item: approvalRequest.approvalItem, commitment });
    emit(record, "approval.requested", {
      approvalId,
      commitment,
      reason: typeof args.reason === "string" ? args.reason : "User approval is required.",
    });
  });
  session.on("error", () => {
    emit(record, "call.error", { message: "The realtime call connection encountered an error." });
  });

  socket.on("close", () => {
    if (record.status !== "ended" && record.status !== "completed") {
      record.status = "disconnected";
      emit(record, "call.state", { status: "disconnected" });
    }
    session.close();
    scheduleCleanup(record);
  });

  void session
    .connect({ apiKey: requireEnv("OPENAI_API_KEY"), model: REALTIME_MODEL })
    .then(() => {
      record.status = "live";
      emit(record, "call.state", { status: "live" });
      scheduleCleanup(record, ACTIVE_RETENTION_MS);
    })
    .catch((error) => {
      request.log.error({ err: error }, "Realtime session failed");
      record.status = "failed";
      emit(record, "call.error", { message: "The realtime session could not connect." });
      emit(record, "call.state", { status: "failed" });
      scheduleCleanup(record);
      socket.close(1011, "Realtime connection failed");
    });
});

await app.listen({ port: PORT, host: HOST });
