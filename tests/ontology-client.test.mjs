/**
 * The ontology client must never answer for a backend it could not reach.
 *
 * PR #77 established this for MoleCareApiClient and gave it a test. It rewrote
 * only that file, so OntologyApiClient kept the old shape: it always called
 * HTTP and always fell back to bundled data when the call failed. With a real
 * backend configured and unreachable, `get_user_moles` correctly errored while
 * `lookup_medical_concept` returned a complete melanoma record with
 * `isError: false`, and nothing in the payload said where it came from.
 *
 * There was no test file for this client, which is why the gap survived a
 * review that was specifically about this behaviour. This is that file.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { OntologyApiClient } from "../dist/api/ontology-client.js";

/** Port 9 is the discard service: nothing answers, so calls fail fast. */
const UNREACHABLE = "http://127.0.0.1:9/api";

const mockClient = () => new OntologyApiClient({ baseUrl: "", apiKey: "" });
const realClient = () =>
  new OntologyApiClient({ baseUrl: UNREACHABLE, apiKey: "test-key" });

test("no credentials means mock mode, and results say so", async () => {
  const client = mockClient();
  assert.equal(client.mockMode, true);
  assert.equal(client.dataSource, "mock");

  const concept = await client.getConceptBySnomedCode("372244006");
  assert.ok(concept, "expected bundled data in mock mode");
  assert.equal(concept.snomedCode, "372244006");
});

test("a URL without a key is still mock mode", () => {
  assert.equal(new OntologyApiClient({ baseUrl: UNREACHABLE, apiKey: "" }).mockMode, true);
});

test("with a backend configured, a failure is an error, never bundled data", async () => {
  const client = realClient();
  assert.equal(client.mockMode, false);
  assert.equal(client.dataSource, "ontology-api");

  // Every call that used to fall back. If any of these resolves, this client
  // has started answering for a backend it never reached.
  await assert.rejects(() => client.getConceptBySnomedCode("372244006"), /Ontology API/);
  await assert.rejects(() => client.searchConcepts("melanoma"), /Ontology API/);
  await assert.rejects(() => client.getConceptsByCategory("MALIGNANT"), /Ontology API/);
  await assert.rejects(() => client.getProgressionPaths("372244006"), /Ontology API/);
  await assert.rejects(() => client.mapSnomedToIcd10("372244006"), /Ontology API/);
  await assert.rejects(() => client.getRiskFactorsForCondition("372244006"), /Ontology API/);
  await assert.rejects(() => client.assessRisk(["FAIR_SKIN"]), /Ontology API/);
  await assert.rejects(() => client.getAbcdeCriteria(), /Ontology API/);
  await assert.rejects(() => client.getFeaturesForCondition("372244006"), /Ontology API/);
  await assert.rejects(() => client.getMalignantConditions(), /Ontology API/);
});

test("the error carries a reason but never the response body", async () => {
  await assert.rejects(
    () => realClient().getConceptBySnomedCode("372244006"),
    (error) => {
      assert.match(error.message, /Ontology API get concept failed/);
      assert.match(error.message, /the backend could not be reached/);
      assert.ok(!error.message.includes("test-key"), "the API key leaked into the message");
      return true;
    },
  );
});

test("mock mode makes no network call at all", async () => {
  // Pointed at the discard port, but with no key. If mock mode were decided
  // per-call rather than once at construction, this would hang or throw.
  const client = new OntologyApiClient({ baseUrl: UNREACHABLE, apiKey: "" });
  const started = Date.now();
  const concept = await client.getConceptBySnomedCode("372244006");
  assert.ok(concept);
  assert.ok(Date.now() - started < 1000, "that looked like a real network attempt");
});

test("a risk factor is never attributed from a substring match", async () => {
  // Array.includes on a string is String.includes, a substring test. Passing
  // "FAIR_SKIN_EXTRA" used to report FAIR_SKIN as a factor the caller never
  // named, with isError false: a wrong clinical answer delivered confidently.
  await assert.rejects(
    () => mockClient().assessRisk("FAIR_SKIN_EXTRA"),
    /must be an array of factor ids, received string/,
  );
  await assert.rejects(
    () => mockClient().assessRisk(undefined),
    /must be an array of factor ids, received undefined/,
  );
});

test("an array of real ids still works", async () => {
  const review = await mockClient().assessRisk(["FAIR_SKIN"]);
  const named = JSON.stringify(review);
  assert.match(named, /FAIR_SKIN/);
});
