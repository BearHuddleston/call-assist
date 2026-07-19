import type {
  CallOutcome,
  CallPlan,
  CallRequest,
  TranscriptTurn,
} from "./contracts";

function isAbsoluteBoundary(boundary: string): boolean {
  return /^(?:do not|don't|never)\b/i.test(boundary.trim());
}

export function createDemoPlan(request: CallRequest): CallPlan {
  const factLines = request.facts
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const approvalBoundaries = request.boundaries.filter((boundary) => !isAbsoluteBoundary(boundary));
  const absoluteBoundaries = request.boundaries.filter(isAbsoluteBoundary);

  return {
    destination: request.destinationName,
    objective: request.goal,
    openingScript: "Hello, I’m Call Assist, an AI accessibility assistant helping someone follow this phone call through live captions. Is it okay to continue with live transcription and keep a temporary text transcript for their review afterward?",
    successCriteria: [
      "The business consents to live transcription and temporary post-call text review.",
      "The goal-critical information is confirmed without unnecessary questions.",
      "No commitment is made without the user’s explicit approval.",
    ],
    conversationPath: [
      { label: "Disclose briefly", detail: "Explain the accessibility role and ask one question for live-transcription consent." },
      { label: "Start from known facts", detail: "State the goal and relevant approved facts before asking the representative for anything." },
      { label: "Confirm one next step", detail: "Tentatively synthesize the likely next step and ask only one essential question if needed." },
      { label: "Approve and close", detail: "Pause before a commitment, read back confirmed details, and stop once the goal is met." },
    ],
    approvedFacts: factLines.length > 0 ? factLines : ["No personal facts beyond the call goal."],
    approvalGates: approvalBoundaries,
    stopConditions: [
      "The business does not consent to live transcription or temporary post-call text review.",
      "The call moves into payments, identity verification, or another unsupported high-risk task.",
      ...absoluteBoundaries,
      "The user pauses or ends the call.",
    ],
    mode: "demo",
  };
}

export function createDemoOutcome(
  request: CallRequest,
  transcript: TranscriptTurn[],
  status: CallOutcome["status"] = "completed",
): CallOutcome {
  const approved = transcript.some((turn) =>
    turn.text.toLowerCase().includes("approved the reservation"),
  );

  return {
    status,
    headline:
      status === "completed"
        ? approved
          ? "Room held for Tuesday at 2:00 PM"
          : "Availability confirmed—no reservation made"
        : "Call ended before every detail was confirmed",
    summary:
      status === "completed"
        ? `The call to ${request.destinationName} confirmed a quiet study room is available Tuesday at 2:00 PM. ${approved ? "Maya approved the no-cost reservation." : "The assistant did not make a commitment."}`
        : `The call to ${request.destinationName} ended early. The assistant preserved the confirmed details and did not make an unsupported commitment.`,
    confirmed: [
      "A quiet study room is available Tuesday at 2:00 PM.",
      "The room can be held for two hours at no cost.",
      approved ? "Maya explicitly approved the reservation." : "No reservation was made.",
    ],
    unresolved: status === "completed" ? [] : ["Reservation status needs confirmation."],
    nextSteps: approved
      ? ["Bring a library card or photo ID to the front desk."]
      : ["Call back or use the library website if Maya wants to reserve the room."],
    referenceNumber: approved ? "WSL-2481" : null,
    mode: "demo",
  };
}
