import assert from "node:assert/strict";
import test from "node:test";
import { CallPlanSchema } from "../lib/contracts.ts";
import { createDemoPlan } from "../lib/demo.ts";

const request = {
  destinationId: "test-library",
  destinationName: "Test Library",
  phoneNumber: "+13125550147",
  goal: "Ask whether a quiet room is available Tuesday afternoon",
  facts: "Preferred time: Tuesday at 2 PM\nTwo people",
  boundaries: ["Ask before making a reservation", "Do not share my address"],
  userConfirmedLowRisk: true,
};

test("the demo plan satisfies the bounded planning contract", () => {
  assert.equal(CallPlanSchema.safeParse(createDemoPlan(request)).success, true);
});

test("the planning contract rejects responses that can create runaway latency", () => {
  const plan = createDemoPlan(request);

  assert.equal(
    CallPlanSchema.safeParse({ ...plan, objective: "x".repeat(361) }).success,
    false,
  );
  assert.equal(
    CallPlanSchema.safeParse({ ...plan, successCriteria: Array(6).fill("Confirmed") }).success,
    false,
  );
  assert.equal(
    CallPlanSchema.safeParse({
      ...plan,
      conversationPath: [...plan.conversationPath, ...plan.conversationPath],
    }).success,
    false,
  );
});
