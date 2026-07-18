import assert from "node:assert/strict";
import test from "node:test";
import { browserStatus, projectLiveEvents, upsertCaptions } from "../lib/live-call.ts";

function event(cursor, type, data) {
  return { cursor, type, data, at: "2026-07-18T21:00:00.000Z" };
}

test("maps provider states to accessible browser states", () => {
  assert.equal(browserStatus("queued"), "connecting");
  assert.equal(browserStatus("ringing"), "ringing");
  assert.equal(browserStatus("in-progress"), "live");
  assert.equal(browserStatus("completed"), "ended");
  assert.equal(browserStatus("no-answer"), "failed");
});

test("projects captions and approval gates from normalized live events", () => {
  const projection = projectLiveEvents([
    event(1, "caption.final", { id: "turn-1", speaker: "business", text: "I can reserve that now." }),
    event(2, "approval.requested", {
      approvalId: "22c85e42-8e06-4f45-aa3f-4179b38f04cb",
      commitment: "Reserve Tuesday at 2 PM",
      reason: "This creates a reservation.",
    }),
  ]);

  assert.deepEqual(projection.captions, [
    { id: "turn-1", speaker: "business", text: "I can reserve that now." },
  ]);
  assert.equal(projection.paused, true);
  assert.equal(projection.approval?.commitment, "Reserve Tuesday at 2 PM");
});

test("marks terminal provider states for outcome creation", () => {
  assert.equal(
    projectLiveEvents([event(1, "call.state", { status: "completed" })]).terminalOutcome,
    "completed",
  );
  assert.equal(
    projectLiveEvents([event(1, "call.state", { status: "busy" })]).terminalOutcome,
    "partial",
  );
});

test("updates revised final captions without duplicating them", () => {
  const current = [{ id: "turn-1", speaker: "business", text: "Tuesday at two" }];
  const next = upsertCaptions(current, [
    { id: "turn-1", speaker: "business", text: "Tuesday at 2:00 PM" },
    { id: "turn-2", speaker: "agent", text: "Let me confirm that." },
  ]);
  assert.equal(next.length, 2);
  assert.equal(next[0].text, "Tuesday at 2:00 PM");
});
