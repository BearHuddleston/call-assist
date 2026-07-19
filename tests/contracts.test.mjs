import assert from "node:assert/strict";
import test from "node:test";
import { CallPlanSchema } from "../lib/contracts.ts";
import {
  createDemoOutcome,
  createDemoPlan,
  createDemoScript,
} from "../lib/demo.ts";
import { DEMO_DESTINATIONS } from "../lib/safety.ts";

const request = {
  destinationId: "test-library",
  destinationName: "Test Library",
  phoneNumber: "+13125550147",
  goal: "Ask whether a quiet room is available Tuesday afternoon",
  facts: "Preferred time: Tuesday at 2 PM\nTwo people",
  boundaries: ["Ask before making a reservation", "Do not share my address"],
  userConfirmedLowRisk: true,
};

function presetRequest(destinationId) {
  const destination = DEMO_DESTINATIONS.find((item) => item.id === destinationId);
  assert.ok(destination);
  return {
    destinationId: destination.id,
    destinationName: destination.name,
    phoneNumber: destination.phoneNumber,
    goal: destination.defaultGoal,
    facts: destination.defaultFacts,
    boundaries: ["Ask before making a reservation or registration"],
    userConfirmedLowRisk: true,
  };
}

test("the demo plan satisfies the bounded planning contract", () => {
  assert.equal(CallPlanSchema.safeParse(createDemoPlan(request)).success, true);
});

test("the demo plan is deterministic for the same reviewed request", () => {
  const first = createDemoPlan(request);
  const second = createDemoPlan(structuredClone(request));

  assert.deepEqual(first, second);
  assert.equal(first.objective, request.goal);
  assert.deepEqual(first.approvedFacts, ["Preferred time: Tuesday at 2 PM", "Two people"]);
  assert.match(first.approvalGates.join(" "), /reservation/);
  assert.match(first.stopConditions.join(" "), /Do not share my address/);
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

test("demo outcomes stay truthful for each destination", () => {
  const lakesideRequest = presetRequest("lakeside-center");
  const approvalOnly = [
    { id: "approval", speaker: "user", text: "Approved: Register for the Tuesday pottery class" },
  ];
  const lakesidePending = createDemoOutcome(
    lakesideRequest,
    approvalOnly,
  );
  assert.match(lakesidePending.headline, /completion not confirmed/i);
  assert.equal(lakesidePending.referenceNumber, null);

  const lakesideTranscript = [
    ...approvalOnly,
    { id: "business-confirmed", speaker: "business", text: "All set. Her confirmation code is LCC-6318." },
  ];
  const lakeside = createDemoOutcome(
    lakesideRequest,
    lakesideTranscript,
  );
  assert.match(lakeside.headline, /Pottery class registration/);
  assert.equal(lakeside.referenceNumber, "LCC-6318");
  assert.doesNotMatch(lakeside.summary, /study room/i);

  const custom = createDemoOutcome(
    {
      ...request,
      destinationId: "live-custom",
      destinationName: "Neighborhood Service Desk",
      goal: "Confirm the requested next step",
    },
    [
      { id: "custom-approval", speaker: "user", text: "Approved: Confirm the requested next step" },
      { id: "custom-confirmed", speaker: "business", text: "Done. The reference is SIM-2048." },
    ],
  );
  assert.match(custom.headline, /no commitment made/i);
  assert.equal(custom.referenceNumber, null);
  assert.doesNotMatch(custom.summary, /study room|pottery/i);
});

test("edited demo requests use a request-derived simulation instead of canned claims", () => {
  const preset = presetRequest("westside-library");
  const requests = [
    {
      ...preset,
      goal: "Ask whether curbside pickup is available Friday afternoon",
      facts: "Pickup window: Friday afternoon\nOrder name: Sam",
    },
    {
      ...preset,
      facts: "Two people\nNo name may be shared",
    },
  ];

  for (const editedRequest of requests) {
    const script = createDemoScript(editedRequest);
    const transcriptText = script.map((turn) => turn.text).join(" ");

    assert.match(transcriptText, new RegExp(editedRequest.goal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(transcriptText, /no commitment was made/i);
    assert.doesNotMatch(transcriptText, /SIM-2048|Done\. The reference/i);
    assert.equal(script.some((turn) => Boolean(turn.approvalGate)), false);
    assert.doesNotMatch(transcriptText, /Maya|WSL-2481|quiet room available from 2:00 to 4:00/i);
  }
});

test("edited informational demos ignore synthetic approvals and references", () => {
  const editedRequest = {
    ...presetRequest("westside-library"),
    goal: "Ask whether curbside pickup is available Friday afternoon",
    facts: "Pickup window: Friday afternoon",
  };
  const approval = {
    id: "approval",
    speaker: "user",
    text: "Approved: Complete the requested next step",
  };

  for (const transcript of [
    [approval],
    [{ id: "business", speaker: "business", text: "Done. The reference is SIM-2048." }],
    [approval, { id: "business", speaker: "business", text: "Done. The reference is SIM-2048." }],
  ]) {
    const outcome = createDemoOutcome(editedRequest, transcript);
    assert.match(outcome.headline, /no commitment made/i);
    assert.equal(outcome.referenceNumber, null);
    assert.match(outcome.summary, /curbside pickup/i);
  }
});

test("an ended specialized call preserves an action already confirmed in the transcript", () => {
  const libraryRequest = presetRequest("westside-library");
  const outcome = createDemoOutcome(
    libraryRequest,
    [
      { id: "approval", speaker: "user", text: "Approved: Reserve the room Tuesday from 2:00 to 4:00 PM" },
      { id: "business", speaker: "business", text: "It’s reserved. The confirmation number is WSL-2481." },
    ],
    "partial",
  );

  assert.match(outcome.headline, /confirmed before the call ended/i);
  assert.equal(outcome.referenceNumber, "WSL-2481");
  assert.doesNotMatch(outcome.summary, /no commitment/i);
});
