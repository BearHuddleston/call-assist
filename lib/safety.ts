import type { CallRequest } from "./contracts";

export const DEMO_DESTINATIONS = [
  {
    id: "westside-library",
    name: "Westside Public Library",
    phoneNumber: "+13125550147",
    displayNumber: "(312) 555-0147",
    description: "Ask about a room reservation",
    defaultGoal: "Reserve a quiet study room next Tuesday at 2:00 PM for two people",
    defaultFacts: "Preferred time: Tuesday at 2:00 PM\nTwo people\nName to use: Maya",
  },
  {
    id: "lakeside-center",
    name: "Lakeside Community Center",
    phoneNumber: "+13125550119",
    displayNumber: "(312) 555-0119",
    description: "Check class availability",
    defaultGoal: "Check the Tuesday evening beginner pottery class and register if it fits",
    defaultFacts: "Preferred class: Tuesday beginner pottery at 6:30 PM\nStep-free entrance needed\nName to use: Maya",
  },
] as const;

export function demoRequestMatchesPreset(request: CallRequest): boolean {
  const preset = DEMO_DESTINATIONS.find(
    (destination) => destination.id === request.destinationId,
  );

  return Boolean(
    preset &&
      request.goal === preset.defaultGoal &&
      request.facts === preset.defaultFacts,
  );
}

const blockedTopics = [
  { pattern: /\b(911|emergency|urgent medical|suicid|overdose)\b/i, reason: "Emergency calls are not supported." },
  { pattern: /\b(pay|payment|credit card|debit card|bank account|wire transfer|purchase)\b/i, reason: "Payments and financial transactions are not supported." },
  { pattern: /\b(diagnos|prescription|dosage|medical advice|insurance claim)\b/i, reason: "High-stakes healthcare tasks are not supported." },
  { pattern: /\b(invest|trade|loan|mortgage|tax filing|legal advice)\b/i, reason: "High-stakes financial or legal tasks are not supported." },
  { pattern: /\b(campaign|telemarket|cold call|lead list|bulk call)\b/i, reason: "Telemarketing and bulk outreach are not supported." },
] as const;

export function normalizePhoneNumber(value: string): string {
  return `+${value.replace(/\D/g, "")}`;
}

export function configuredAllowlist(envValue?: string): Set<string> {
  const configured = (envValue ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map(normalizePhoneNumber);

  return new Set([
    ...DEMO_DESTINATIONS.map((destination) => destination.phoneNumber),
    ...configured,
  ]);
}

export function screenCallRequest(
  request: CallRequest,
  envAllowlist?: string,
): { allowed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const allowlist = configuredAllowlist(envAllowlist);
  const normalized = normalizePhoneNumber(request.phoneNumber);
  const textToScreen = `${request.goal}\n${request.facts}`;

  if (!allowlist.has(normalized)) {
    reasons.push("That phone number is not approved for this SayAhead demo.");
  }

  for (const topic of blockedTopics) {
    if (topic.pattern.test(textToScreen)) reasons.push(topic.reason);
  }

  if (!request.userConfirmedLowRisk) {
    reasons.push("The user must confirm that this is a low-risk, user-initiated call.");
  }

  return { allowed: reasons.length === 0, reasons };
}
