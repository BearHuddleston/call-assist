import assert from "node:assert/strict";
import test from "node:test";
import {
  configuredAllowlist,
  normalizePhoneNumber,
  screenCallRequest,
} from "../lib/safety.ts";

const safeRequest = {
  destinationId: "westside-library",
  destinationName: "Westside Public Library",
  phoneNumber: "+13125550147",
  goal: "Reserve a quiet study room next Tuesday",
  facts: "Two people\nName to use: Maya",
  boundaries: ["Ask before making a reservation"],
  userConfirmedLowRisk: true,
};

test("normalizes phone numbers before allowlist comparison", () => {
  assert.equal(normalizePhoneNumber("(312) 555-0147"), "+3125550147");
  assert.equal(configuredAllowlist("+1 (773) 555-0100").has("+17735550100"), true);
});

test("allows a confirmed low-risk call to a demo destination", () => {
  assert.deepEqual(screenCallRequest(safeRequest), { allowed: true, reasons: [] });
});

test("blocks a number that is not allowlisted", () => {
  const result = screenCallRequest({ ...safeRequest, phoneNumber: "+14155550123" });
  assert.equal(result.allowed, false);
  assert.match(result.reasons.join(" "), /allowlist/i);
});

test("blocks emergency, payment, and high-stakes requests", () => {
  for (const goal of [
    "Call 911 about an emergency",
    "Make a credit card payment",
    "Ask for medical advice about a prescription dosage",
  ]) {
    const result = screenCallRequest({ ...safeRequest, goal });
    assert.equal(result.allowed, false, goal);
  }
});

