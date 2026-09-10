/**
 * Provenance for bundled SNOMED CT / ICD-10 educational data.
 *
 * The data itself lives in `terminology-data.ts`, which is the single source
 * for the mock ontology in `src/api/ontology-client.ts` and the
 * `molecare://ontology/*` resources in `src/server.ts`. The educational prose
 * in `medical-kb.ts` does not carry clinical codes.
 *
 * This is not a licensed SNOMED CT distribution. Mappings are educational
 * approximations, not certified map rows from a SNOMED release package.
 */

export type MappingExactness = "exact" | "approximate-category";

export const TERMINOLOGY_PROVENANCE = {
  snomedCt: {
    edition: "SNOMED CT International Edition",
    checkedAgainst: "https://tx.fhir.org/r4 (FHIR CodeSystem/$lookup)",
    lastChecked: "2026-09-10",
    note:
      "Each bundled identifier was resolved against the SNOMED CT International Edition through a public FHIR terminology server and its display compared with the label shipped here; every identifier also passes the SNOMED Verhoeff check digit. tests/terminology.test.mjs holds the expected names and fails if any code drifts. This package ships a small educational subset only — not a licensed terminology release. Plain-English search aliases are written for this package and are not SNOMED CT descriptions.",
    redistribution:
      "The bundled concept set is deliberately not being expanded. Free use of SNOMED CT in a member country is not the same as free redistribution via npm to non-member territories, and that question is open with SNOMED International (see MoleCare/molecare-mcp#49). Until it is answered this package ships only the concepts it already shipped, and adds no new concept identifiers.",
  },
  icd10: {
    revision: "WHO ICD-10 (2019 version)",
    checkedAgainst: "https://icd.who.int/browse10/2019/en",
    lastChecked: "2026-09-08",
    note:
      "Mostly three-character category codes such as C43 and D22, with four-character subcategories only where the three-character category alone would be misleading (L57.0, D18.0, L72.0, L91.0, C46.0, D48.5). It does not claim ICD-10-CM or any other national clinical modification: ICD-10-CM-only codes such as C4A are deliberately absent, and C43/C44 are not expanded to site-specific fourth characters. Categories were compiled against the WHO ICD-10 2019 tabular list.",
    redistribution:
      "WHO licenses ICD-10 more permissively than SNOMED International licenses SNOMED CT, and category-level codes are the least restricted part. ICD-10 coverage here is therefore broader than SNOMED coverage.",
  },
  snomedToIcd10: {
    exactness: "approximate-category" as MappingExactness,
    note:
      "SNOMED-to-ICD-10 is frequently not one-to-one. Bundled mappings are educational category-level approximations, and some concepts carry more than one plausible target. Treat them as starting points for learning, not as certified map rows.",
  },
} as const;

export type TerminologyProvenance = typeof TERMINOLOGY_PROVENANCE;
