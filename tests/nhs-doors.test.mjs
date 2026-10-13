import assert from "node:assert/strict";
import { test } from "node:test";

import { MedicalKnowledgeBase } from "../dist/resources/medical-kb.js";

// England's everyday skin pathway is home → pharmacist → GP, with 111/999
// only for unwell-and-rash. Quote the NHS boxes. Never apply them to a photo.
const kb = new MedicalKnowledgeBase();

for (const query of ["pharmacist", "pharmacy first", "111", "itchy skin"]) {
  test(`searching "${query}" finds the NHS doors entry first`, () => {
    assert.equal(kb.search(query)[0]?.term, "NHS Skin Care Doors");
  });
}

test("the NHS doors entry quotes pharmacist, GP and 111, and judges nothing", () => {
  const text = JSON.stringify(kb.search("pharmacist")[0]);
  for (const point of [
    "pharmacist",
    "GP",
    "111",
    "999",
    "England",
    "not applied to anyone's photos",
  ]) {
    assert.match(text, new RegExp(point, "i"), `missing: ${point}`);
  }
  assert.doesNotMatch(
    text,
    /melanoma|benign|malignant|risk score|emergency|your photo|diagnos/i,
  );
});

test("the NHS doors resource is static lists, never a photo read", () => {
  const resource = kb.getResource("molecare://knowledge/nhs-skin-doors");
  assert.ok(resource);
  assert.match(resource.content.neverAppliedToPhotos, /not applied to anyone's photos/i);
  assert.match(resource.content.englandNote, /England/);
  assert.equal(resource.content.pharmacist.length, 4);
  assert.equal(resource.content.gp.length, 5);
  assert.equal(resource.content.urgent.length, 3);
});

test("earlier entries keep their searches", () => {
  assert.equal(kb.search("heatwave")[0].term, "Hot Weather and Skin");
  assert.equal(kb.search("shade")[0].term, "UV Protection");
  assert.equal(kb.search("spf")[0].term, "Sunscreen");
});
