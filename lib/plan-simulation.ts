export type PlanningExperience = "checking" | "ai" | "demo";

export const DEMO_PLAN_PHASE_DURATION_MS = 1_500;

export const DEMO_PLAN_PHASES = [
  "Reading your goal and the facts you approved",
  "Checking your boundaries and where to pause",
  "Planning the conversation—without turning it into twenty questions",
  "Getting the plan ready for you",
] as const;

export function planningStatusMessage(
  mode: PlanningExperience,
  elapsedSeconds: number,
  demoPhaseIndex: number | null = null,
): string {
  if (mode === "demo") {
    const phase = DEMO_PLAN_PHASES[demoPhaseIndex ?? 0] ?? DEMO_PLAN_PHASES[0];
    return `Demo mode · Showing how GPT-5.6 would build the plan: ${phase}…`;
  }

  if (mode === "ai") {
    if (elapsedSeconds < 8) return "GPT-5.6 is turning your notes into a call plan…";
    if (elapsedSeconds < 20) {
      return "Still working out the shortest useful conversation…";
    }
    return "The plan is taking the scenic route. Keep waiting or cancel—your details will stay put.";
  }

  return "Getting the call plan ready…";
}
