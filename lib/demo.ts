import type {
  CallOutcome,
  CallPlan,
  CallRequest,
  TranscriptTurn,
} from "./contracts";

export function createDemoPlan(request: CallRequest): CallPlan {
  const factLines = request.facts
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    destination: request.destinationName,
    objective: request.goal,
    openingScript: `Hello, I’m an AI accessibility assistant calling for Maya. Maya is following with live captions. With your permission, I’d like to continue and ask about ${request.goal.toLowerCase()}.`,
    successCriteria: [
      "The business consents to continue with live transcription.",
      "The availability and reservation requirements are confirmed.",
      "No commitment is made without Maya’s explicit approval.",
    ],
    conversationPath: [
      { label: "Disclose and ask", detail: "Identify the AI accessibility assistant and ask permission for live transcription." },
      { label: "Gather", detail: "Ask for availability, requirements, and any time-sensitive details." },
      { label: "Confirm", detail: "Read back the key details and pause before any reservation or commitment." },
      { label: "Close", detail: "Request a reference number and summarize the next step." },
    ],
    approvedFacts: factLines.length > 0 ? factLines : ["No personal facts beyond the call goal."],
    approvalGates: request.boundaries,
    stopConditions: [
      "The business does not consent to live transcription.",
      "The call moves into payments, identity verification, or another unsupported high-risk task.",
      "Maya pauses or ends the call.",
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
    transcriptDiscarded: true,
    mode: "demo",
  };
}

