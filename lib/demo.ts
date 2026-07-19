import type {
  CallOutcome,
  CallPlan,
  CallRequest,
  TranscriptTurn,
} from "./contracts";

const SPECIALIZED_DEMO_PRESETS: Record<string, { goal: string; facts: string }> = {
  "westside-library": {
    goal: "Reserve a quiet study room next Tuesday at 2:00 PM for two people",
    facts: "Preferred time: Tuesday at 2:00 PM\nTwo people\nName to use: Maya",
  },
  "lakeside-center": {
    goal: "Check the Tuesday evening beginner pottery class and register if it fits",
    facts: "Preferred class: Tuesday beginner pottery at 6:30 PM\nStep-free entrance needed\nName to use: Maya",
  },
};

function requestMatchesSpecializedDemo(request: CallRequest): boolean {
  const preset = SPECIALIZED_DEMO_PRESETS[request.destinationId];
  return Boolean(
    preset && request.goal === preset.goal && request.facts === preset.facts,
  );
}

export type DemoScriptTurn = Omit<TranscriptTurn, "id"> & {
  approvalGate?: string;
};

function genericRequestScript(
  request: CallRequest,
  plan: CallPlan | null,
): DemoScriptTurn[] {
  const factSummary = request.facts
    .split("\n")
    .map((fact) => fact.trim())
    .filter(Boolean)
    .join("; ");
  const requestDetails = factSummary
    ? ` Here are the details I may share: ${factSummary}.`
    : "";
  const approvalGate = plan?.approvalGates[0] ?? "Complete the requested next step";

  return [
    { speaker: "agent", text: "Hi, I’m Call Assist, an AI accessibility assistant. I’m helping the user follow this call with live captions. May I continue with live transcription and keep a temporary text transcript for their review afterward?" },
    { speaker: "business", text: "Yes, that’s okay. How can I help?" },
    { speaker: "agent", text: `Thanks. The user asked me to help with this: ${request.goal}.${requestDetails}` },
    { speaker: "business", text: "I can help with that. I have what I need to complete the next step. Should I go ahead?", approvalGate },
    { speaker: "agent", text: "The user approved the next step. Please go ahead within the limits they set." },
    { speaker: "business", text: "Done. The reference is SIM-2048." },
    { speaker: "agent", text: "Thanks. I’ll pass that confirmation along. Goodbye." },
  ];
}

export function createDemoScript(
  request: CallRequest,
  plan: CallPlan | null,
): DemoScriptTurn[] {
  if (!requestMatchesSpecializedDemo(request)) {
    return genericRequestScript(request, plan);
  }

  if (request.destinationId === "lakeside-center") {
    return [
      { speaker: "agent", text: "Hi, I’m Call Assist, an AI accessibility assistant helping Maya follow this call with live captions. May I continue with live transcription and keep a temporary text transcript for her to review afterward?" },
      { speaker: "business", text: "Yes, that’s okay. How can I help?" },
      { speaker: "agent", text: "Thanks. Maya is checking whether the Tuesday evening beginner pottery class still has space." },
      { speaker: "business", text: "There are two spaces left. The class begins Tuesday at 6:30 PM and materials are included." },
      { speaker: "agent", text: "Good to know. Is the studio entrance step-free?" },
      { speaker: "business", text: "Yes. The north entrance is step-free, and registration is available at no cost. I can register Maya now if she’d like.", approvalGate: "Register for the Tuesday pottery class" },
      { speaker: "agent", text: "Maya approved the registration. Please go ahead." },
      { speaker: "business", text: "All set. Her confirmation code is LCC-6318. Please arrive ten minutes early." },
      { speaker: "agent", text: "Thanks. I’ll give Maya the confirmation and arrival note. Goodbye." },
    ];
  }

  return [
    { speaker: "agent", text: "Hi, I’m Call Assist, an AI accessibility assistant helping Maya follow this call with live captions. May I continue with live transcription and keep a temporary text transcript for her to review afterward?" },
    { speaker: "business", text: "Yes, that’s fine. How can I help today?" },
    { speaker: "agent", text: "Thanks. Maya needs a quiet study room next Tuesday at 2:00 PM for two people." },
    { speaker: "business", text: "Let me check. We have a quiet room available from 2:00 to 4:00 PM." },
    { speaker: "agent", text: "Great. If Maya reserves it, what should she bring?" },
    { speaker: "business", text: "There’s no fee. She should bring a library card or photo ID. I can hold the room now.", approvalGate: "Reserve the room Tuesday from 2:00 to 4:00 PM" },
    { speaker: "agent", text: "Maya approved the reservation. Please hold the room." },
    { speaker: "business", text: "It’s reserved. The confirmation number is WSL-2481." },
    { speaker: "agent", text: "Thanks. I’ll give Maya the confirmation number and arrival details. Goodbye." },
  ];
}

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
    openingScript: "Hi, I’m Call Assist, an AI accessibility assistant. I’m helping someone follow this call with live captions. May I continue with live transcription and keep a temporary text transcript for their review afterward?",
    successCriteria: [
      "The person answering consents to live transcription and temporary post-call text review.",
      "The goal-critical information is confirmed without unnecessary questions.",
      "No commitment is made without the user’s explicit approval.",
    ],
    conversationPath: [
      { label: "Introduce Call Assist", detail: "Explain the accessibility role and ask one clear question for transcription consent." },
      { label: "Lead with what is known", detail: "State the goal and approved facts before asking the representative for anything." },
      { label: "Work out the next step", detail: "Offer the likely next step tentatively, then ask only one essential question if needed." },
      { label: "Pause, confirm, and close", detail: "Stop before a commitment, read back the confirmed details, and end once the goal is met." },
    ],
    approvedFacts: factLines.length > 0 ? factLines : ["No personal facts beyond the call goal."],
    approvalGates: approvalBoundaries,
    stopConditions: [
      "The person answering does not consent to live transcription or temporary post-call text review.",
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
  const specializedDemo = requestMatchesSpecializedDemo(request);
  const userApproved = transcript.some(
    (turn) => turn.speaker === "user" && /^approved:/i.test(turn.text),
  );
  const businessTurns = transcript.filter((turn) => turn.speaker === "business");
  const referenceNumber = businessTurns
    .map((turn) =>
      turn.text.match(
        /\b(?:reference(?: number)?|confirmation (?:code|number))\s+(?:is\s+)?([A-Z]{2,}-\d+)\b/i,
      )?.[1] ?? null,
    )
    .find((reference): reference is string => Boolean(reference)) ?? null;
  const expectedReferencePrefix = specializedDemo
    ? request.destinationId === "lakeside-center"
      ? "LCC-"
      : "WSL-"
    : "SIM-";
  const confirmedReference = referenceNumber?.startsWith(expectedReferencePrefix)
    ? referenceNumber
    : null;
  const personConfirmed = Boolean(
    confirmedReference && businessTurns.some(
      (turn) =>
        turn.text.includes(confirmedReference) &&
        /\b(all set|confirmed|reserved|registered|completed?|done)\b/i.test(turn.text),
    ),
  );
  const actionConfirmed = userApproved && personConfirmed;

  if (status !== "completed") {
    return {
      status,
      headline: actionConfirmed
        ? "Action confirmed before the call ended"
        : "Call ended before every detail was confirmed",
      summary: actionConfirmed
        ? `The call to ${request.destinationName} ended early, but the transcript shows that the user approved the action and the person answering confirmed it.`
        : `The call to ${request.destinationName} ended early. The review transcript keeps what was confirmed, and no completed commitment appears in it.`,
      confirmed: actionConfirmed
        ? ["The person answering confirmed the user-approved action."]
        : ["No completed commitment was confirmed."],
      unresolved: ["Whether any other details still need follow-up."],
      nextSteps: ["Review the transcript and decide whether to follow up."],
      referenceNumber: actionConfirmed ? confirmedReference : null,
      mode: "demo",
    };
  }

  if (userApproved && !actionConfirmed) {
    return {
      status,
      headline: "Action approved—completion not confirmed",
      summary: `The user approved the proposed action during the call to ${request.destinationName}, but the transcript does not show the person answering confirming it.`,
      confirmed: ["The user approved the proposed action."],
      unresolved: ["Whether the person answering completed the action."],
      nextSteps: [`Review the transcript or follow up with ${request.destinationName} before relying on the action.`],
      referenceNumber: null,
      mode: "demo",
    };
  }

  if (specializedDemo && request.destinationId === "lakeside-center") {
    return {
      status,
      headline: actionConfirmed
        ? "Pottery class registration confirmed"
        : "Pottery class details confirmed—no registration made",
      summary: `The call to ${request.destinationName} confirmed two spaces remain in Tuesday’s 6:30 PM beginner pottery class. ${actionConfirmed ? "Maya approved the free registration, and the community center confirmed it." : "Call Assist made no commitment."}`,
      confirmed: [
        "Two spaces remain in Tuesday’s 6:30 PM beginner pottery class.",
        "Materials are included, and the north entrance is step-free.",
        actionConfirmed ? "Maya approved the registration, and the community center confirmed it." : "No registration was made.",
      ],
      unresolved: [],
      nextSteps: actionConfirmed
        ? ["Arrive ten minutes early; use the north entrance if a step-free route is needed."]
        : ["Register later if Maya wants one of the remaining spaces."],
      referenceNumber: actionConfirmed ? confirmedReference : null,
      mode: "demo",
    };
  }

  if (!specializedDemo) {
    return {
      status,
      headline: actionConfirmed ? "Requested next step confirmed" : "Simulation complete—no commitment confirmed",
      summary: `The simulated call to ${request.destinationName} followed the submitted goal—${request.goal}. ${actionConfirmed ? "The user approved the next step, and the person answering confirmed it." : "The transcript does not show both user approval and confirmation from the person answering."}`,
      confirmed: actionConfirmed
        ? ["The person answering confirmed the user-approved next step."]
        : ["No completed commitment was confirmed."],
      unresolved: actionConfirmed ? [] : ["Whether the requested next step was completed."],
      nextSteps: actionConfirmed
        ? ["Keep the confirmation details for reference."]
        : ["Review the transcript and decide whether to follow up."],
      referenceNumber: actionConfirmed ? confirmedReference : null,
      mode: "demo",
    };
  }

  return {
    status,
    headline: actionConfirmed
      ? "Room held for Tuesday at 2:00 PM"
      : "Availability confirmed—no reservation made",
    summary: `The call to ${request.destinationName} confirmed a quiet study room is available Tuesday at 2:00 PM. ${actionConfirmed ? "Maya approved the no-cost reservation, and the library confirmed it." : "Call Assist made no commitment."}`,
    confirmed: [
      "A quiet study room is available Tuesday at 2:00 PM.",
      "The room can be held for two hours at no cost.",
      actionConfirmed ? "Maya approved the reservation, and the library confirmed it." : "No reservation was made.",
    ],
    unresolved: [],
    nextSteps: actionConfirmed
      ? ["Bring a library card or photo ID to the front desk."]
      : ["Call back or use the library website if Maya wants to reserve the room."],
    referenceNumber: actionConfirmed ? confirmedReference : null,
    mode: "demo",
  };
}
