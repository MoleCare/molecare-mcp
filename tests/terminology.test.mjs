/**
 * Every clinical code this server ships must be the concept it says it is.
 *
 * It was not. Four of seven SNOMED codes named a different disease from the
 * label beside them: the code labelled "dysplastic nevus" was basal cell
 * carcinoma, "basal cell carcinoma" was squamous cell carcinoma, "actinic
 * keratosis" was carcinoma in situ of the uterine cervix, and "melanoma in
 * situ" was not a well-formed SNOMED identifier at all. A shipped provenance
 * block said all seven had been checked against the SNOMED browser. Nothing
 * had been checked, and no test would have noticed.
 *
 * This is that test. It is offline on purpose, because the suite runs against
 * mocks: the expected names below were resolved once against the SNOMED CT
 * International Edition (tx.fhir.org, 2026-09-10) and written down. If a code
 * or a label drifts from this table, this fails. If the table itself needs to
 * change, re-resolve the code before editing it.
 *
 * A note to whoever next runs a search-and-replace over tests/: this file
 * names the retired codes on purpose, to assert they stay gone. Do not
 * "fix" them.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

import { OntologyApiClient } from "../dist/api/ontology-client.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * code -> fully specified name (semantic tag dropped), as SNOMED CT
 * International Edition returns it. Resolved 2026-09-10.
 */
const EXPECTED = {
  "93655004": "Malignant melanoma of skin",
  "400010006": "Melanocytic naevus of skin",
  "254818000": "Dysplastic naevus of skin",
  "109266006": "Melanoma in situ of skin",
  "254701007": "Basal cell carcinoma of skin",
  "254651007": "Squamous cell carcinoma of skin",
  "201101007": "Actinic keratosis",
};

/** Codes that used to ship and must never come back. */
const RETIRED = {
  "372244006": "melanoma of any site, shipped as 'of skin'",
  "21119008": "inactive morphology code shipped as 'pigmented nevus'",
  "254652000": "clear-cell SCC subtype shipped as 'squamous cell carcinoma'",
  "92564006": "carcinoma in situ of uterine cervix shipped as 'actinic keratosis'",
  "109264001": "not a valid SNOMED identifier, shipped as 'melanoma in situ'",
};

/** Verhoeff check, which every SNOMED CT identifier must pass. */
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
function verhoeffValid(id) {
  let c = 0;
  const digits = [...id].reverse();
  for (let i = 0; i < digits.length; i++) c = D[c][P[i % 8][Number(digits[i])]];
  return c === 0;
}

/** Compare names allowing the naevus/nevus spelling split. */
const norm = (s) => s.toLowerCase().replace(/naevus/g, "nevus").replace(/\s+\(.*\)$/, "").trim();

/**
 * A shipped label is allowed to be a shortening of the fully specified name,
 * so "Dysplastic nevus" may stand for "Dysplastic naevus of skin" in a
 * lay-facing product. It is never allowed to name a different disease, and a
 * prefix test guarantees exactly that: "Basal cell carcinoma" is not a prefix
 * of "Squamous cell carcinoma of skin", and "Actinic keratosis" is not a
 * prefix of anything cervical. The minimum length stops a degenerate label
 * such as "Malignant" from passing on its own.
 */
function labelMatches(label, fsn) {
  const l = norm(label);
  const f = norm(fsn);
  return l.length >= 10 && (f === l || f.startsWith(`${l} `));
}

/**
 * Every (file, code, label) triple in built output.
 *
 * Deliberately a list, not a map keyed by code. An earlier version merged the
 * two files into one Map, so a correct label in server.js silently overwrote a
 * wrong label for the same code in ontology-client.js and the test passed with
 * "Squamous cell carcinoma" sitting on the basal cell carcinoma code. Every
 * occurrence is checked on its own now; nothing can mask anything.
 */
function shippedCodes(file) {
  const text = readFileSync(join(ROOT, "dist", file), "utf8");
  const found = [];
  for (const m of text.matchAll(/(?:snomedCode|code):\s*"(\d{6,18})"[\s\S]{0,200}?name:\s*"([^"]+)"/g)) {
    found.push({ file, code: m[1], label: m[2] });
  }
  return found;
}

test("every shipped SNOMED code is a valid identifier and names the right concept", () => {
  const seen = [...shippedCodes("api/ontology-client.js"), ...shippedCodes("server.js")];
  const distinct = new Set(seen.map((s) => s.code));
  assert.ok(distinct.size >= 7, `expected at least 7 distinct codes, found ${distinct.size}`);
  assert.ok(seen.length > distinct.size, "expected codes to appear more than once; the scan looks broken");

  for (const { file, code, label } of seen) {
    // ICD-10 entries in the same files are letters+digits and never match \d{6,}.
    assert.ok(verhoeffValid(code), `${file}: ${code} fails the Verhoeff check; it is not a SNOMED identifier`);
    assert.ok(code in EXPECTED, `${file}: ${code} ("${label}") is not in the verified table; resolve it before shipping it`);
    assert.ok(
      labelMatches(label, EXPECTED[code]),
      `${file}: ${code} is labelled "${label}" but SNOMED CT says "${EXPECTED[code]}"`,
    );
  }
});

test("no retired or invalid code has crept back into the built server", () => {
  const blobs = ["dist/api/ontology-client.js", "dist/server.js", "dist/tools/knowledge.js"]
    .map((f) => readFileSync(join(ROOT, f), "utf8"))
    .join("\n");
  for (const [code, why] of Object.entries(RETIRED)) {
    assert.ok(!blobs.includes(code), `${code} is back: ${why}`);
  }
});

test("the mock ontology answers with the right concept for each verified code", async () => {
  const client = new OntologyApiClient({ baseUrl: "", apiKey: "" });
  // The client bundles a subset of the table; whichever it answers for must agree.
  let checked = 0;
  for (const [code, want] of Object.entries(EXPECTED)) {
    const concept = await client.getConceptBySnomedCode(code);
    if (!concept) continue;
    assert.equal(concept.snomedCode, code);
    assert.ok(labelMatches(concept.name, want), `${code}: "${concept.name}" vs "${want}"`);
    checked++;
  }
  assert.ok(checked >= 3, `only ${checked} bundled concepts resolved; the mock table looks broken`);
});

test("every concept the mock client can hand out names the right disease", async () => {
  // getConceptBySnomedCode reads one table; the malignant-conditions list and
  // the search results are separate tables in the same file. A wrong label in
  // any of them reaches a client, so every path is checked, not just the first.
  const client = new OntologyApiClient({ baseUrl: "", apiKey: "" });
  const handedOut = [
    ...(await client.getMalignantConditions()),
    ...(await client.searchConcepts("melanoma")),
    ...(await client.searchConcepts("carcinoma")),
    ...(await client.searchConcepts("nevus")),
    ...(await client.searchConcepts("keratosis")),
    ...(await client.getConceptsByCategory("MALIGNANT")),
    ...(await client.getConceptsByCategory("PRECANCEROUS")),
    ...(await client.getConceptsByCategory("BENIGN")),
  ];
  assert.ok(handedOut.length >= 4, `only ${handedOut.length} concepts came back; the mock paths look broken`);
  for (const concept of handedOut) {
    const code = concept.snomedCode;
    assert.ok(code in EXPECTED, `${code} ("${concept.name}") is handed out but not in the verified table`);
    assert.ok(
      labelMatches(concept.name, EXPECTED[code]),
      `${code} is handed out as "${concept.name}" but SNOMED CT says "${EXPECTED[code]}"`,
    );
  }
});

test("melanoma in situ is not filed as precancerous anywhere", async () => {
  // It is stage-0 melanoma. The server's own ICD-10 resource files it under D03
  // in chapter II, Neoplasms; the concept table said PRECANCEROUS. One server,
  // one entity, one category.
  const text = readFileSync(join(ROOT, "dist", "api", "ontology-client.js"), "utf8")
    + readFileSync(join(ROOT, "dist", "server.js"), "utf8");
  const bad = /name:\s*"Melanoma in situ[^"]*"[\s\S]{0,200}?category:\s*"PRECANCEROUS"/.test(text);
  assert.ok(!bad, "melanoma in situ is labelled PRECANCEROUS again");
});

test("the provenance block says what was actually checked", () => {
  const src = readFileSync(join(ROOT, "src", "resources", "terminology-provenance.ts"), "utf8");
  assert.ok(
    !/checked against the SNOMED International browser/.test(src),
    "the provenance still claims a browser check that was never performed",
  );
  assert.match(src, /Verhoeff/, "the provenance should say the check digit is verified");
  assert.match(src, /terminology\.test\.mjs/, "the provenance should point at the test that enforces it");
});
