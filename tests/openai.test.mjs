import assert from "node:assert/strict";
import test from "node:test";
import { getPlanningMode } from "../lib/openai.ts";

test("planning mode is demo-first and requires an explicit live configuration", () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousDemoMode = process.env.CALL_ASSIST_DEMO_MODE;

  try {
    delete process.env.OPENAI_API_KEY;
    delete process.env.CALL_ASSIST_DEMO_MODE;
    assert.equal(getPlanningMode(), "demo");

    process.env.OPENAI_API_KEY = "test-key";
    process.env.CALL_ASSIST_DEMO_MODE = "true";
    assert.equal(getPlanningMode(), "demo");

    process.env.CALL_ASSIST_DEMO_MODE = "false";
    assert.equal(getPlanningMode(), "ai");
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
    if (previousDemoMode === undefined) delete process.env.CALL_ASSIST_DEMO_MODE;
    else process.env.CALL_ASSIST_DEMO_MODE = previousDemoMode;
  }
});
