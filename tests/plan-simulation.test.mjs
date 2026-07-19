import assert from "node:assert/strict";
import test from "node:test";
import {
  DEMO_PLAN_PHASE_DURATION_MS,
  DEMO_PLAN_PHASES,
  planningStatusMessage,
} from "../lib/plan-simulation.ts";

test("demo planning presents four visible 1.5-second GPT-5.6 simulation phases", () => {
  assert.equal(DEMO_PLAN_PHASE_DURATION_MS, 1_500);
  assert.equal(DEMO_PLAN_PHASES.length, 4);
  for (const [index, phase] of DEMO_PLAN_PHASES.entries()) {
    const message = planningStatusMessage("demo", index, index);
    assert.match(message, /Demo mode · Simulating GPT-5.6/);
    assert.match(message, new RegExp(phase));
  }
});

test("AI and unknown planning retain honest mode-specific messages", () => {
  assert.match(planningStatusMessage("ai", 0), /GPT-5.6/);
  assert.doesNotMatch(planningStatusMessage("checking", 0), /GPT|simulation/);
});
