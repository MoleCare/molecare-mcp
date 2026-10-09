import assert from "node:assert/strict";
import { test } from "node:test";

import { MedicalKnowledgeBase } from "../dist/resources/medical-kb.js";

// Heat and UV increasingly arrive together (2025 exposome reviews). The app
// shows the UV index; this entry answers what to do on a hot day.
const kb = new MedicalKnowledgeBase();

for (const query of ["heatwave", "hot weather", "heat rash", "uv index"]) {
  test(`searching "${query}" finds the hot-weather entry first`, () => {
    assert.equal(kb.search(query)[0]?.term, "Hot Weather and Skin");
  });
}

test("the hot-weather entry gives the public-health basics and judges nothing", () => {
  const text = JSON.stringify(kb.search("heatwave")[0]);
  for (const point of ["11am and 3pm", "water", "UV index is 3", "pharmacist"]) {
    assert.match(text, new RegExp(point, "i"), `missing: ${point}`);
  }
  assert.doesNotMatch(text, /melanoma|benign|malignant|risk score|emergency/i);
});

test("earlier entries keep their searches", () => {
  assert.equal(kb.search("shade")[0].term, "UV Protection");
  assert.equal(kb.search("base tan")[0].term, "Sun Safety Myths");
  assert.equal(kb.search("spf")[0].term, "Sunscreen");
});
