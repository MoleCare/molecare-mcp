/**
 * Provenance for bundled SNOMED CT / ICD-10 educational data.
 *
 * Concept identifiers and category-level ICD-10 codes live in
 * `src/api/ontology-client.ts` (mock ontology) and the
 * `molecare://ontology/*` resources in `src/index.ts`. The educational
 * prose in `medical-kb.ts` does not carry clinical codes.
 *
 * This is not a licensed SNOMED CT distribution. Mappings are educational
 * approximations, not certified map rows from a SNOMED release package.
 */

export type MappingExactness = "exact" | "approximate-category";

export const TERMINOLOGY_PROVENANCE = {
  snomedCt: {
    edition: "SNOMED CT International Edition",
    checkedAgainst: "https://browser.ihtsdotools.org/",
    lastChecked: "2026-09-03",
    note:
      "Concept identifiers and fully specified names were checked against the SNOMED International browser. This package ships a small educational subset only — not a licensed terminology release.",
  },
  icd10: {
    revision: "WHO ICD-10 (three-character category codes)",
    lastChecked: "2026-09-03",
    note:
      "Uses category-level codes such as C43 and D22. It does not claim ICD-10-CM or other national clinical modifications, and it does not expand to site-specific fourth characters.",
  },
  snomedToIcd10: {
    exactness: "approximate-category" as MappingExactness,
    note:
      "SNOMED-to-ICD-10 is frequently not one-to-one. Bundled mappings are educational category-level approximations. Treat them as starting points for learning, not as certified map rows.",
  },
} as const;

export type TerminologyProvenance = typeof TERMINOLOGY_PROVENANCE;
