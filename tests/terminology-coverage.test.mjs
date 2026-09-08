/**
 * The bundled terminology has to agree with itself.
 *
 * Before this suite existed, `molecare://ontology/snomed-codes` advertised
 * seven SNOMED concepts while `lookup_medical_concept` resolved three of them
 * and `map_snomed_to_icd10` mapped two. These are the invariants that keep the
 * advertised surface and the answerable surface the same size.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ICD10_CATEGORIES,
  SNOMED_CONCEPTS,
  SNOMED_TO_ICD10,
  conceptsByCategory,
  findConcept,
  findIcd10,
  icd10MappingsFor,
  searchConcepts,
  terminologyCoverage,
} from "../dist/resources/terminology-data.js";
import { TERMINOLOGY_PROVENANCE } from "../dist/resources/terminology-provenance.js";

test("every bundled SNOMED concept resolves by code", () => {
  assert.ok(SNOMED_CONCEPTS.length > 0);
  for (const concept of SNOMED_CONCEPTS) {
    assert.deepEqual(findConcept(concept.snomedCode), concept);
    assert.deepEqual(
      findConcept(` ${concept.snomedCode} `),
      concept,
      "codes should resolve with surrounding whitespace"
    );
  }
});

test("SNOMED concept codes and names are unique", () => {
  const codes = SNOMED_CONCEPTS.map((c) => c.snomedCode);
  const names = SNOMED_CONCEPTS.map((c) => c.name);
  assert.equal(new Set(codes).size, codes.length, "duplicate SNOMED code");
  assert.equal(new Set(names).size, names.length, "duplicate concept name");
  for (const code of codes) {
    assert.match(code, /^\d{6,18}$/, `${code} is not a SNOMED identifier`);
  }
});

test("every bundled SNOMED concept maps to at least one ICD-10 category", () => {
  for (const concept of SNOMED_CONCEPTS) {
    const rows = icd10MappingsFor(concept.snomedCode);
    assert.ok(
      rows.length > 0,
      `${concept.snomedCode} (${concept.name}) has no ICD-10 mapping`
    );
  }
});

test("every mapping target exists in the ICD-10 catalogue", () => {
  for (const [snomedCode, rows] of Object.entries(SNOMED_TO_ICD10)) {
    assert.ok(
      findConcept(snomedCode),
      `mapping table references unbundled concept ${snomedCode}`
    );
    for (const row of rows) {
      assert.ok(
        findIcd10(row.icd10Code),
        `${snomedCode} maps to ${row.icd10Code}, which is not in ICD10_CATEGORIES`
      );
      assert.ok(row.rationale.length > 0, `${snomedCode} -> ${row.icd10Code} has no rationale`);
      assert.equal(
        row.exactness,
        TERMINOLOGY_PROVENANCE.snomedToIcd10.exactness,
        "mappings must declare the exactness the provenance block promises"
      );
    }
  }
});

test("ICD-10 catalogue is well formed and covers dermatology broadly", () => {
  const codes = ICD10_CATEGORIES.map((c) => c.code);
  assert.equal(new Set(codes).size, codes.length, "duplicate ICD-10 code");

  for (const entry of ICD10_CATEGORIES) {
    assert.match(
      entry.code,
      /^[A-Z]\d{2}(\.\d)?$/,
      `${entry.code} is not a WHO ICD-10 category or subcategory`
    );
    assert.ok(entry.name.length > 0, `${entry.code} has no name`);
    assert.ok(entry.chapter.includes("Chapter"), `${entry.code} has no chapter`);
  }

  // ICD-10-CM-only codes must not appear; the provenance block disclaims them.
  assert.equal(
    codes.some((code) => code.startsWith("C4A")),
    false,
    "C4A is ICD-10-CM only and must not be bundled"
  );

  // The groups the issue asked for are all represented.
  const groups = new Set(ICD10_CATEGORIES.map((c) => c.group));
  for (const group of ["Malignant", "In situ", "Benign", "Precancerous", "Inflammatory"]) {
    assert.ok(groups.has(group), `no ICD-10 categories in group ${group}`);
  }

  // Both dermatology chapters are covered, not just neoplasms.
  const chapters = new Set(ICD10_CATEGORIES.map((c) => c.chapter));
  assert.equal(chapters.size, 2, "expected Chapter II and Chapter XII");
});

test("ICD-10 lookup is case and whitespace tolerant", () => {
  assert.equal(findIcd10(" c43 ")?.code, "C43");
  assert.equal(findIcd10("l57.0")?.code, "L57.0");
  assert.equal(findIcd10("ZZ9"), undefined);
});

test("category filter returns only that category", () => {
  const malignant = conceptsByCategory("malignant");
  assert.ok(malignant.length > 0);
  assert.ok(malignant.every((c) => c.category === "MALIGNANT"));
  assert.equal(conceptsByCategory("NOT_A_CATEGORY").length, 0);
});

test("search finds concepts by name, alias and code", () => {
  assert.ok(searchConcepts("melanoma").length >= 2);
  assert.ok(searchConcepts("BCC").some((c) => c.snomedCode === "254651007"));
  assert.ok(searchConcepts("mole").some((c) => c.snomedCode === "21119008"));
  assert.deepEqual(
    searchConcepts("372244006").map((c) => c.snomedCode),
    ["372244006"]
  );
  assert.equal(searchConcepts("xyzzy").length, 0);
  assert.equal(searchConcepts("   ").length, SNOMED_CONCEPTS.length);
});

test("coverage lists every bundled concept and names the licensing hold", () => {
  const coverage = terminologyCoverage();
  assert.deepEqual(
    coverage.bundledSnomedConcepts.map((c) => c.snomedCode),
    SNOMED_CONCEPTS.map((c) => c.snomedCode)
  );
  assert.equal(coverage.bundledIcd10CategoryCount, ICD10_CATEGORIES.length);
  assert.match(coverage.note, /SNOMED International/);
});

test("the SNOMED concept set has not grown past what was already shipped", () => {
  // Expanding this set is blocked on a redistribution question with SNOMED
  // International (MoleCare/molecare-mcp#49). If you are here because you added
  // a concept, that question needs an answer first — see
  // TERMINOLOGY_PROVENANCE.snomedCt.redistribution.
  assert.deepEqual(
    [...SNOMED_CONCEPTS.map((c) => c.snomedCode)].sort(),
    [
      "109264001",
      "21119008",
      "254651007",
      "254652000",
      "254701007",
      "372244006",
      "92564006",
    ].sort()
  );
  assert.match(TERMINOLOGY_PROVENANCE.snomedCt.redistribution, /not being expanded/);
});
