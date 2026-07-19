export type PlanningExperience = "checking" | "ai" | "demo";

export function planningStatusMessage(
  mode: PlanningExperience,
  elapsedSeconds: number,
): string {
  if (mode === "demo") {
    if (elapsedSeconds < 1) {
      return "Deterministic simulation: checking the goal and safety boundaries…";
    }
    if (elapsedSeconds < 5) {
      return "Deterministic simulation: assembling a low-pressure conversation path…";
    }
    return "The simulated plan is taking longer than expected. You can cancel without losing your details.";
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
