/**
 * Educational-only shapes for clinical-adjacent MCP tools.
 * Never name a condition as a match, never emit a risk/urgency score.
 */

export const EDUCATIONAL_ONLY_NOTE =
  "The ABCDE criteria describe asymmetry, border, colour, diameter, and evolution. A clinician interprets what you notice. Educational only — not a diagnosis.";

export const EDUCATIONAL_RISK_NOTE =
  "These are named educational factors. Having one or more does not mean you will develop a condition. This is not a risk score or a diagnosis.";

export interface LesionFeatureInput {
  asymmetry?: boolean;
  irregularBorder?: boolean;
  multipleColors?: boolean;
  diameterMm?: number;
  hasChanged?: boolean;
}

export interface NamedAbcdeCriterion {
  id: string;
  name: string;
  description: string;
  noted: boolean;
}

export interface EducationalClassification {
  criteria: NamedAbcdeCriterion[];
  note: string;
}

export interface NamedRiskFactor {
  factorId: string;
  name: string;
  description: string;
}

export interface EducationalRiskReview {
  namedFactors: NamedRiskFactor[];
  note: string;
}

export function describeAbcde(
  features: LesionFeatureInput
): NamedAbcdeCriterion[] {
  return [
    {
      id: "A",
      name: "Asymmetry",
      description:
        "One half of the lesion does not match the other. Clinicians assess this visually.",
      noted: Boolean(features.asymmetry),
    },
    {
      id: "B",
      name: "Border",
      description:
        "Edges that look ragged, notched, or blurred are one feature clinicians assess.",
      noted: Boolean(features.irregularBorder),
    },
    {
      id: "C",
      name: "Colour",
      description:
        "More than one colour, or uneven colour, is one feature clinicians assess.",
      noted: Boolean(features.multipleColors),
    },
    {
      id: "D",
      name: "Diameter",
      description:
        features.diameterMm != null
          ? `Recorded size is ${features.diameterMm} mm. Clinicians often note lesions larger than about 6 mm, the size of a pencil eraser.`
          : "Clinicians often note lesions larger than about 6 mm, the size of a pencil eraser.",
      noted: features.diameterMm != null && features.diameterMm > 6,
    },
    {
      id: "E",
      name: "Evolution",
      description:
        "A change in size, shape, or colour over time is one feature clinicians assess.",
      noted: Boolean(features.hasChanged),
    },
  ];
}

export function educationalClassification(
  features: LesionFeatureInput
): EducationalClassification {
  return { criteria: describeAbcde(features), note: EDUCATIONAL_ONLY_NOTE };
}

export function educationalRiskReview(
  factors: NamedRiskFactor[]
): EducationalRiskReview {
  return {
    namedFactors: factors.map(({ factorId, name, description }) => ({
      factorId,
      name,
      description,
    })),
    note: EDUCATIONAL_RISK_NOTE,
  };
}

/** Live APIs may still return verdict fields. Drop them. */
export function sanitizeClassification(
  features: LesionFeatureInput,
  _raw?: unknown
): EducationalClassification {
  return educationalClassification(features);
}

export function sanitizeRiskAssessments(
  namedFactors: NamedRiskFactor[],
  _raw?: unknown
): EducationalRiskReview {
  return educationalRiskReview(namedFactors);
}

export function publicMoleRecord(m: {
  id: string;
  bodyPart: string;
  nickname?: string;
  createdAt: string;
  lastAnalyzedAt?: string;
  images?: unknown[];
}) {
  return {
    id: m.id,
    bodyPart: m.bodyPart,
    nickname: m.nickname,
    createdAt: m.createdAt,
    lastAnalyzedAt: m.lastAnalyzedAt,
    imageCount: Array.isArray(m.images) ? m.images.length : 0,
  };
}

export function publicComparison(c: {
  sizeChangePercent: number;
  colorChange: string;
  borderChange: string;
  overallChange: string;
}) {
  return {
    sizeChangePercent: c.sizeChangePercent,
    colorChange: c.colorChange,
    borderChange: c.borderChange,
    overallChange: c.overallChange,
  };
}

export function publicHistoryChange(change: {
  date?: string;
  type?: string;
  description?: string;
}) {
  return {
    date: change.date,
    type: change.type,
    description: change.description,
  };
}
