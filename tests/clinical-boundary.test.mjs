import { test } from "node:test";
import assert from "node:assert/strict";
import {
  educationalClassification,
  educationalRiskReview,
  publicComparison,
  publicHistoryChange,
  publicMoleRecord,
  sanitizeClassification,
  sanitizeRiskAssessments,
} from "../dist/clinical-boundary.js";

const VERDICT =
  /melanoma|HIGH|MODERATE|LOW|consult promptly|schedule dermatologist|combinedRelativeRisk|overallRiskLevel|matchScore|possibleConditions/i;

test("classification lists ABCDE only — no condition, score, or urgency", () => {
  const out = educationalClassification({
    asymmetry: true,
    irregularBorder: true,
    multipleColors: true,
    diameterMm: 12,
    hasChanged: true,
  });
  const blob = JSON.stringify(out);
  assert.match(blob, /ABCDE/);
  assert.doesNotMatch(blob, VERDICT);
  assert.equal(out.criteria.filter((c) => c.noted).length, 5);
  assert.match(out.note, /not a diagnosis/i);
});

test("sanitizeClassification ignores a live melanoma verdict", () => {
  const out = sanitizeClassification(
    { asymmetry: true },
    {
      possibleConditions: [
        { concept: { name: "Malignant melanoma of skin" }, matchScore: 0.7 },
      ],
      riskLevel: "HIGH",
      recommendation: "Please consult a dermatologist promptly.",
    }
  );
  const blob = JSON.stringify(out);
  assert.doesNotMatch(blob, VERDICT);
  assert.equal(out.criteria.find((c) => c.id === "A")?.noted, true);
});

test("risk review never multiplies relative risk", () => {
  const out = educationalRiskReview([
    {
      factorId: "FAIR_SKIN",
      name: "Fair skin",
      description: "Fitzpatrick I–II",
    },
    {
      factorId: "UV_EXPOSURE",
      name: "UV exposure",
      description: "Sun or tanning beds",
    },
  ]);
  const blob = JSON.stringify(out);
  assert.doesNotMatch(blob, VERDICT);
  assert.equal(out.namedFactors.length, 2);
  assert.match(out.note, /not a risk score/i);
});

test("sanitizeRiskAssessments drops live HIGH / melanoma fields", () => {
  const out = sanitizeRiskAssessments(
    [{ factorId: "FAIR_SKIN", name: "Fair skin", description: "I–II" }],
    [
      {
        combinedRelativeRisk: 8,
        overallRiskLevel: "HIGH",
        elevatedRiskConditions: [{ name: "Malignant melanoma of skin" }],
        recommendation: "Schedule dermatologist appointment",
      },
    ]
  );
  const blob = JSON.stringify(out);
  assert.doesNotMatch(blob, VERDICT);
  assert.equal(out.namedFactors[0]?.factorId, "FAIR_SKIN");
});

test("public mole records drop risk bands", () => {
  const out = publicMoleRecord({
    id: "mole-1",
    bodyPart: "Arm",
    createdAt: "2024-01-01T00:00:00Z",
    images: [{}, {}],
  });
  const blob = JSON.stringify(out);
  assert.doesNotMatch(blob, VERDICT);
  assert.equal(out.imageCount, 2);
  assert.equal("riskLevel" in out, false);
});

test("public comparison and history drop triage fields", () => {
  const comparison = publicComparison({
    sizeChangePercent: 5,
    colorChange: "none",
    borderChange: "none",
    overallChange: "small",
  });
  const change = publicHistoryChange({
    date: "2024-01-01",
    type: "SIZE",
    description: "+0.3mm",
  });
  assert.doesNotMatch(JSON.stringify(comparison), VERDICT);
  assert.doesNotMatch(JSON.stringify(change), VERDICT);
  assert.equal("significance" in comparison, false);
});
