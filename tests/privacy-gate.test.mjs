/**
 * The egress check on tool results.
 *
 * No network: `fetch` is injected. Two properties carry the safety of this and
 * most of the file is about them — it is off unless configured, and it fails
 * closed.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  checkResult,
  gateConfig,
  isChecked,
  textOfResult,
} from "../dist/privacy-gate.js";

const config = (over = {}) => ({ url: "http://127.0.0.1:8231", timeoutMs: 500, ...over });

const responds = (status, body) => async () => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
const rejects = () => async () => {
  throw new Error("connect ECONNREFUSED");
};

// ------------------------------------------------------------------ off ----

test("unset PRIVACY_GATE_URL means the gate is off", () => {
  assert.equal(gateConfig({}).url, null);
  assert.equal(gateConfig({ PRIVACY_GATE_URL: "" }).url, null);
  assert.equal(gateConfig({ PRIVACY_GATE_URL: "  " }).url, null);
});

test("a published install calls nothing", async () => {
  // The important one. molecare-mcp works with no credentials and no services
  // by design, and adding a privacy feature must not change that.
  const verdict = await checkResult("anything at all", config({ url: null }), rejects());
  assert.equal(verdict.hold, false);
});

test("a trailing slash in the URL does not produce a double slash", () => {
  assert.equal(gateConfig({ PRIVACY_GATE_URL: "http://x:8231/" }).url, "http://x:8231");
});

// ------------------------------------------------------------- verdicts ----

test("a held result is held", async () => {
  const verdict = await checkResult("her biopsy is booked", config(), responds(200, { hold: true, score: 7.2 }));
  assert.equal(verdict.hold, true);
  assert.equal(verdict.score, 7.2);
});

test("a clean result passes", async () => {
  const verdict = await checkResult("the ABCDE criteria", config(), responds(200, { hold: false, score: -5.1 }));
  assert.equal(verdict.hold, false);
});

test("an empty result is not sent to the gate", async () => {
  assert.equal((await checkResult("   ", config(), rejects())).hold, false);
});

// -------------------------------------------------------- fails closed -----

test("an unreachable gate holds", async () => {
  const verdict = await checkResult("anything", config(), rejects());
  assert.equal(verdict.hold, true);
  assert.equal(verdict.unavailable, true);
});

test("a 503 from the sidecar holds", async () => {
  // The sidecar answers 503 with hold:true when its embedding endpoint is down.
  const verdict = await checkResult("anything", config(), responds(503, { hold: true }));
  assert.equal(verdict.hold, true);
  assert.equal(verdict.unavailable, true);
});

test("a malformed answer holds", async () => {
  const verdict = await checkResult("anything", config(), async () => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new Error("not json");
    },
  }));
  assert.equal(verdict.hold, true);
});

test("checkResult never throws", async () => {
  for (const impl of [rejects(), responds(500, null), responds(200, undefined)]) {
    await assert.doesNotReject(() => checkResult("x", config(), impl));
  }
});

// ------------------------------------------------------------ coverage -----

test("tools that read user data are checked", () => {
  for (const tool of [
    "get_user_moles",
    "get_mole_analysis",
    "get_mole_changes",
    "compare_moles",
    "get_user_risk_factors",
  ]) {
    assert.equal(isChecked(tool), true, `${tool} must be checked`);
  }
});

test("public reference lookups are exempt", () => {
  for (const tool of ["search_medical_info", "map_snomed_to_icd10", "get_malignant_conditions"]) {
    assert.equal(isChecked(tool), false, `${tool} names no person`);
  }
});

test("a tool nobody has thought about yet is checked", () => {
  // The allowlist is the exemption, not the rule. A tool added later is
  // protected by default and someone has to think before exempting it.
  assert.equal(isChecked("some_tool_added_next_year"), true);
});

// -------------------------------------------------------------- parsing ----

test("only text blocks are judged", () => {
  const result = {
    content: [
      { type: "text", text: "first" },
      { type: "image", data: "AAAA" },
      { type: "text", text: "second" },
    ],
  };
  assert.equal(textOfResult(result), "first\nsecond");
});

test("a result with no content yields nothing to judge", () => {
  for (const shape of [{}, null, undefined, { content: "not an array" }, { content: [] }]) {
    assert.equal(textOfResult(shape), "");
  }
});
