import assert from "node:assert/strict";
import test from "node:test";
import { createDemoPlan } from "../lib/demo.ts";
import {
  approvalActionHasExplicitGate,
  approvalConflictsWithAbsoluteBoundary,
  buildAgentInstructions,
  CALL_PLAN_INSTRUCTIONS,
  commitmentViolatesProductScope,
  enforcePlanBoundaries,
  isAbsoluteBoundary,
} from "../lib/prompts.ts";

const request = {
  destinationId: "test-library",
  destinationName: "Test Library",
  phoneNumber: "+13125550147",
  goal: "Ask whether a quiet room is available Tuesday afternoon",
  facts: "Preferred time: Tuesday at 2 PM\nTwo people",
  boundaries: ["Ask before making a reservation", "Do not share my address"],
  userConfirmedLowRisk: true,
};

const plan = {
  destination: request.destinationName,
  objective: request.goal,
  openingScript: "Hello, I am an AI accessibility assistant. Is live transcription and temporary text review okay?",
  successCriteria: ["Availability is confirmed"],
  conversationPath: [
    { label: "Start from known facts", detail: "State Tuesday at 2 PM before asking anything." },
    { label: "Confirm the fit", detail: "Offer the closest business-confirmed option tentatively." },
  ],
  approvedFacts: ["Preferred time: Tuesday at 2 PM", "Two people"],
  approvalGates: [...request.boundaries, "Share my address with the business"],
  stopConditions: ["Stop if transcription consent is declined"],
  mode: "ai",
};

test("live instructions carry the reviewed path into a low-pressure conversation", () => {
  const instructions = buildAgentInstructions(request, plan);

  assert.match(instructions, /REVIEWED CONVERSATION PATH/);
  assert.match(instructions, /Start from known facts: State Tuesday at 2 PM/);
  assert.match(instructions, /SUCCESS CRITERIA[\s\S]*Availability is confirmed/);
  assert.match(instructions, /Ask at most one focused question per spoken turn/);
  assert.match(instructions, /ask no more than two substantive clarification questions/);
  assert.match(instructions, /tentative working interpretation/);
  assert.match(instructions, /Never guess personal data[\s\S]*availability, price, policy/);
  assert.match(instructions, /Never use disability, hardship, urgency, guilt, praise, or obligation to pressure/);
  assert.match(instructions, /request_user_approval/);
  assert.match(instructions, /Payments, purchases, subscriptions, deposits[\s\S]*remain unsupported even if approval is offered/);
  assert.match(instructions, /Preferred time: Tuesday at 2 PM/);
  assert.match(instructions, /ABSOLUTE USER BOUNDARIES[\s\S]*Do not share my address/);
  const approvalSection = instructions.match(/APPROVAL GATES\n([\s\S]*?)\n\nABSOLUTE USER BOUNDARIES/)?.[1] ?? "";
  assert.doesNotMatch(approvalSection, /address/i);
});

test("planning instructions favor synthesis over checklist questioning", () => {
  assert.match(CALL_PLAN_INSTRUCTIONS, /not as a checklist interview/);
  assert.match(CALL_PLAN_INSTRUCTIONS, /three to five conversationPath steps total/);
  assert.match(CALL_PLAN_INSTRUCTIONS, /at most one per turn/);
  assert.match(CALL_PLAN_INSTRUCTIONS, /no more than two substantive clarification questions/);
  assert.match(CALL_PLAN_INSTRUCTIONS, /offer that interpretation and invite correction/);
  assert.match(CALL_PLAN_INSTRUCTIONS, /temporary text transcript for the user’s post-call review/);
  assert.match(CALL_PLAN_INSTRUCTIONS, /Say the user is Deaf or hard of hearing only when that identity is explicitly present/);
  assert.match(CALL_PLAN_INSTRUCTIONS, /beginning with "Do not" or "Never" as an absolute prohibition/);
  assert.match(CALL_PLAN_INSTRUCTIONS, /Never infer personal details[\s\S]*price, business policy/);
  assert.match(CALL_PLAN_INSTRUCTIONS, /never use disability[\s\S]*as leverage/i);
  assert.match(CALL_PLAN_INSTRUCTIONS, /Keep every field brief and preserve supplied facts exactly/);
  assert.match(CALL_PLAN_INSTRUCTIONS, /three or four success criteria/);
});

test("the demo plan models one-question consent and a generic user", () => {
  const demo = createDemoPlan(request);
  const questions = demo.openingScript.match(/\?/g) ?? [];

  assert.equal(questions.length, 1);
  assert.doesNotMatch(demo.openingScript, /Maya/);
  assert.doesNotMatch(demo.openingScript, /\bDeaf\b|hard-of-hearing/i);
  assert.match(demo.openingScript, /accessibility assistant/i);
  assert.match(demo.openingScript, /temporary text transcript/i);
  assert.match(demo.conversationPath.map((step) => step.detail).join(" "), /ask only one essential question/i);
  assert.deepEqual(demo.approvalGates, ["Ask before making a reservation"]);
  assert.match(demo.stopConditions.join(" "), /Do not share my address/);
});

test("absolute boundaries cannot become approval gates", () => {
  assert.equal(isAbsoluteBoundary("Do not share my address"), true);
  assert.equal(isAbsoluteBoundary("Never disclose my account number"), true);
  assert.equal(isAbsoluteBoundary("Ask before making a reservation"), false);
  assert.equal(
    approvalConflictsWithAbsoluteBoundary(
      "Share my address with the business",
      "Do not share my date of birth, address, or account credentials",
    ),
    true,
  );
  assert.equal(
    approvalConflictsWithAbsoluteBoundary(
      "Reserve the room Tuesday at 2 PM",
      "Do not share my date of birth, address, or account credentials",
    ),
    false,
  );
  for (const approval of [
    "Approve a charge of $10",
    "Authorize payment of $10",
    "Approve the purchase",
    "Pay a $10 fee",
    "Authorize a $10 deposit",
    "Place the order",
    "Start a paid subscription",
  ]) {
    assert.equal(
      approvalConflictsWithAbsoluteBoundary(
        approval,
        "Do not agree to charges, payments, or purchases",
      ),
      true,
      approval,
    );
  }
  assert.equal(
    approvalConflictsWithAbsoluteBoundary(
      "Reveal the user's mailing location",
      "Do not share my address",
    ),
    true,
  );
  assert.equal(commitmentViolatesProductScope("Tell them where the user lives"), true);
  for (const unsafeCommitment of [
    "Reserve the room for $10",
    "Reserve the room for ten dollars",
    "$10 surcharge",
  ]) {
    assert.equal(commitmentViolatesProductScope(unsafeCommitment), true, unsafeCommitment);
  }
  for (const safeCommitment of [
    "Reserve the free room; there is no fee",
    "Reserve the room; no payment is required",
    "Reserve the room; the fee is waived",
  ]) {
    assert.equal(commitmentViolatesProductScope(safeCommitment), false, safeCommitment);
  }
  assert.equal(approvalActionHasExplicitGate("reservation", []), false);
  assert.equal(
    approvalActionHasExplicitGate("reservation", ["Ask before making a reservation"]),
    true,
  );
  assert.equal(
    approvalActionHasExplicitGate("registration", ["Ask before any commitment"]),
    true,
  );

  const enforced = enforcePlanBoundaries(
    {
      ...plan,
      approvalGates: [
        "Reserve the room after confirming there is no charge",
        "Share my address with the business",
      ],
      stopConditions: ["Stop if consent is declined"],
    },
    request,
  );
  assert.deepEqual(enforced.approvalGates, ["Ask before making a reservation"]);
  assert.match(enforced.stopConditions.join(" "), /Do not share my address/);
});
