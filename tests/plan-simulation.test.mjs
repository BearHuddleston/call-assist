import assert from "node:assert/strict";
import test from "node:test";
import { planningStatusMessage } from "../lib/plan-simulation.ts";

test("demo planning uses explicit staged simulation messages", () => {
  assert.match(planningStatusMessage("demo", 0), /^Deterministic simulation:/);
  assert.match(planningStatusMessage("demo", 1), /low-pressure conversation path/);
  assert.match(planningStatusMessage("demo", 5), /longer than expected/);
  assert.doesNotMatch(planningStatusMessage("demo", 0), /GPT-5.6/);
});

test("AI and unknown planning retain honest mode-specific messages", () => {
  assert.match(planningStatusMessage("ai", 0), /GPT-5.6/);
  assert.doesNotMatch(planningStatusMessage("checking", 0), /GPT|simulation/);
});
