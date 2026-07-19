export type PlanningExperience = "checking" | "ai" | "demo";

export const DEMO_PLAN_PHASE_DURATION_MS = 1_000;

export const DEMO_PLAN_PHASES = [
  "Reviewing the call goal and approved facts",
  "Checking safety boundaries and approval gates",
  "Designing a low-pressure conversation path",
  "Preparing the plan for review",
] as const;

export function planningStatusMessage(
  mode: PlanningExperience,
  elapsedSeconds: number,
  demoPhaseIndex: number | null = null,
): string {
  if (mode === "demo") {
    const phase = DEMO_PLAN_PHASES[demoPhaseIndex ?? 0] ?? DEMO_PLAN_PHASES[0];
    return `Demo mode · Simulating GPT-5.6 plan creation: ${phase}…`;
  }

  if (mode === "ai") {
    if (elapsedSeconds < 8) return "GPT-5.6 is preparing the call plan…";
    if (elapsedSeconds < 20) {
      return "Still preparing a concise, low-pressure conversation path…";
    }
    return "This is taking longer than usual. You can keep waiting or cancel without losing your details.";
  }

  return "Preparing the call plan…";
}
