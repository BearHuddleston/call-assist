import type { LiveCallEvent, TranscriptTurn } from "./contracts";

export type BrowserCallStatus =
  | "connecting"
  | "ringing"
  | "live"
  | "ending"
  | "ended"
  | "failed";

export type LiveApproval = {
  id: string;
  commitment: string;
  reason: string;
};

export type LiveEventProjection = {
  captions: TranscriptTurn[];
  status?: BrowserCallStatus;
  paused?: boolean;
  approval?: LiveApproval | null;
  error?: string;
  terminalOutcome?: "completed" | "partial";
};

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function browserStatus(providerStatus: string): BrowserCallStatus {
  switch (providerStatus.toLowerCase()) {
    case "ringing":
      return "ringing";
    case "answered":
    case "in-progress":
    case "live":
    case "paused":
      return "live";
    case "ending":
      return "ending";
    case "completed":
    case "ended":
      return "ended";
    case "busy":
    case "failed":
    case "no-answer":
    case "canceled":
    case "disconnected":
      return "failed";
    default:
      return "connecting";
  }
}

export function projectLiveEvents(events: LiveCallEvent[]): LiveEventProjection {
  const projection: LiveEventProjection = { captions: [] };

  for (const event of events) {
    if (event.type === "caption.final") {
      const id = textValue(event.data.id);
      const text = textValue(event.data.text);
      const speaker = event.data.speaker === "agent" ? "agent" : "business";
      if (id && text) projection.captions.push({ id, text, speaker });
    } else if (event.type === "approval.requested") {
      const id = textValue(event.data.approvalId);
      const commitment = textValue(event.data.commitment);
      if (id && commitment) {
        projection.approval = {
          id,
          commitment,
          reason: textValue(event.data.reason) ?? "Your approval is required before continuing.",
        };
        projection.paused = true;
      }
    } else if (event.type === "approval.resolved") {
      projection.approval = null;
      projection.paused = false;
    } else if (event.type === "call.error") {
      projection.error = textValue(event.data.message) ?? "The live call encountered an error.";
      projection.status = "failed";
    } else {
      const status = textValue(event.data.status);
      if (!status) continue;
      projection.status = browserStatus(status);
      if (status === "paused") projection.paused = true;
      if (status === "live" || status === "answered" || status === "in-progress") {
        projection.paused = false;
      }
      if (status === "completed" || status === "ended") projection.terminalOutcome = "completed";
      if (["busy", "failed", "no-answer", "canceled", "disconnected"].includes(status)) {
        projection.terminalOutcome = "partial";
      }
    }
  }

  return projection;
}

export function upsertCaptions(
  current: TranscriptTurn[],
  incoming: TranscriptTurn[],
): TranscriptTurn[] {
  const next = [...current];
  for (const caption of incoming) {
    const index = next.findIndex((item) => item.id === caption.id);
    if (index === -1) next.push(caption);
    else next[index] = caption;
  }
  return next;
}
