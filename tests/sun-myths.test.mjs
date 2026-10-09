import assert from "node:assert/strict";
import { test } from "node:test";

import { MedicalKnowledgeBase } from "../dist/resources/medical-kb.js";

// Sun-safety myths spread online (AAD 2025 survey). Someone searching the
// myth's own words should land on the entry that answers it.
const kb = new MedicalKnowledgeBase();

for (const query of ["base tan", "sunbed", "vitamin d", "cloudy", "is sunscreen safe", "darker skin"]) {
  test(`searching "${query}" finds the sun-safety myths entry first`, () => {
    const [first] = kb.search(query);
    assert.ok(first, `no result for ${query}`);
    assert.equal(first.term, "Sun Safety Myths");
  });
}

test("the myths entry answers each myth and judges no mole", () => {
  const [entry] = kb.search("myths");
  const text = JSON.stringify(entry);
  for (const myth of ["base tan", "cloud", "darker skin", "more harmful than the sun", "vitamin D"]) {
    assert.match(text, new RegExp(myth, "i"), `myth not covered: ${myth}`);
  }
  assert.doesNotMatch(text, /melanoma|benign|malignant|risk score|you should see/i);
});

test("existing searches still find their own entries", () => {
  assert.equal(kb.search("spf")[0].term, "Sunscreen");
  assert.equal(kb.search("evolving")[0].term, "Evolution");
  assert.equal(kb.search("shade")[0].term, "UV Protection");
});
