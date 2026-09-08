/**
 * The bundled dermatology terminology, in one place.
 *
 * Every SNOMED CT concept, ICD-10 category and SNOMED-to-ICD-10 mapping the
 * server can return is defined here. `ontology-client.ts` (mock paths) and the
 * `molecare://ontology/*` resources both read from these tables, so a concept
 * advertised by a resource is always resolvable by a tool.
 *
 * Provenance for the whole dataset lives in `terminology-provenance.ts`.
 *
 * ## Why SNOMED coverage is smaller than ICD-10 coverage
 *
 * Expanding the bundled SNOMED CT concept set is on hold pending a
 * redistribution question with SNOMED International (MoleCare/molecare-mcp#49):
 * free *use* in a member country is not the same as free *redistribution* via
 * npm to non-member territories. Until that is answered, `SNOMED_CONCEPTS`
 * stays at the concepts this package already shipped, and no new concept
 * identifiers are added.
 *
 * WHO ICD-10 carries no such restriction at this level, so `ICD10_CATEGORIES`
 * covers dermatology more broadly. The asymmetry is deliberate, and
 * `terminologyCoverage()` reports it rather than hiding it.
 */

import type { MappingExactness } from "./terminology-provenance.js";

export type ConceptCategory = "MALIGNANT" | "PRECANCEROUS" | "BENIGN";
export type ConceptSeverity = "LOW" | "MODERATE" | "HIGH";

export interface BundledConcept {
  snomedCode: string;
  name: string;
  description: string;
  category: ConceptCategory;
  severity: ConceptSeverity;
  /**
   * Plain-English search terms written for this package. These are *not*
   * SNOMED CT descriptions and are not drawn from a SNOMED release.
   */
  searchAliases: string[];
}

export interface Icd10Category {
  code: string;
  name: string;
  chapter: string;
  group: string;
  /** Scope note, where the category covers more than its title suggests. */
  note?: string;
}

export interface Icd10MappingRow {
  icd10Code: string;
  exactness: MappingExactness;
  /** Why this SNOMED concept lands in this ICD-10 category. */
  rationale: string;
}

// =============================================================================
// SNOMED CT CONCEPTS
// Frozen at the set already shipped by this package — see the note above.
// Identifiers and fully specified names were checked against the SNOMED
// International browser; see TERMINOLOGY_PROVENANCE.snomedCt.
// =============================================================================

export const SNOMED_CONCEPTS: readonly BundledConcept[] = [
  {
    snomedCode: "372244006",
    name: "Malignant melanoma of skin",
    description:
      "The most serious type of skin cancer, arising from melanocytes (pigment-producing cells).",
    category: "MALIGNANT",
    severity: "HIGH",
    searchAliases: ["melanoma", "malignant melanoma", "skin cancer"],
  },
  {
    snomedCode: "109264001",
    name: "Melanoma in situ",
    description:
      "Melanoma confined to the epidermis, without invasion of the dermis.",
    category: "PRECANCEROUS",
    severity: "MODERATE",
    searchAliases: ["melanoma in situ", "in situ melanoma", "stage 0 melanoma"],
  },
  {
    snomedCode: "254651007",
    name: "Basal cell carcinoma",
    description:
      "The most common type of skin cancer, arising from basal keratinocytes.",
    category: "MALIGNANT",
    severity: "MODERATE",
    searchAliases: ["basal cell carcinoma", "bcc", "rodent ulcer", "skin cancer"],
  },
  {
    snomedCode: "254652000",
    name: "Squamous cell carcinoma",
    description:
      "The second most common type of skin cancer, arising from squamous keratinocytes.",
    category: "MALIGNANT",
    severity: "MODERATE",
    searchAliases: ["squamous cell carcinoma", "scc", "skin cancer"],
  },
  {
    snomedCode: "92564006",
    name: "Actinic keratosis",
    description:
      "A rough, scaly patch of skin associated with long-term ultraviolet exposure.",
    category: "PRECANCEROUS",
    severity: "MODERATE",
    searchAliases: ["actinic keratosis", "solar keratosis", "sun damage"],
  },
  {
    snomedCode: "254701007",
    name: "Dysplastic nevus",
    description:
      "A melanocytic naevus showing architectural and cytological atypia.",
    category: "PRECANCEROUS",
    severity: "MODERATE",
    searchAliases: ["dysplastic nevus", "dysplastic naevus", "atypical mole", "mole"],
  },
  {
    snomedCode: "21119008",
    name: "Pigmented nevus",
    description: "A benign proliferation of melanocytes; a common mole.",
    category: "BENIGN",
    severity: "LOW",
    searchAliases: ["pigmented nevus", "pigmented naevus", "mole", "naevus", "nevus"],
  },
] as const;

// =============================================================================
// WHO ICD-10 CATEGORIES
// Three-character categories, plus four-character subcategories where the
// three-character category alone would be misleading (L57.0, D18.0, L72.0).
// Not ICD-10-CM: codes such as C4A (Merkel cell carcinoma) are a US clinical
// modification and are deliberately absent.
// =============================================================================

const NEOPLASMS = "Chapter II - Neoplasms";
const SKIN = "Chapter XII - Diseases of the skin and subcutaneous tissue";

export const ICD10_CATEGORIES: readonly Icd10Category[] = [
  // --- Malignant -----------------------------------------------------------
  {
    code: "C43",
    name: "Malignant melanoma of skin",
    chapter: NEOPLASMS,
    group: "Malignant",
    note: "Category level; fourth characters give the anatomical site.",
  },
  {
    code: "C44",
    name: "Other malignant neoplasms of skin",
    chapter: NEOPLASMS,
    group: "Malignant",
    note:
      "Covers basal cell and squamous cell carcinoma. WHO ICD-10 also classifies Merkel cell carcinoma here by morphology; the separate C4A category exists only in ICD-10-CM, which this package does not use.",
  },
  {
    code: "C46.0",
    name: "Kaposi sarcoma of skin",
    chapter: NEOPLASMS,
    group: "Malignant",
  },
  // --- In situ / uncertain behaviour ---------------------------------------
  {
    code: "D03",
    name: "Melanoma in situ",
    chapter: NEOPLASMS,
    group: "In situ",
  },
  {
    code: "D04",
    name: "Carcinoma in situ of skin",
    chapter: NEOPLASMS,
    group: "In situ",
    note: "Includes Bowen's disease (squamous cell carcinoma in situ).",
  },
  {
    code: "D48.5",
    name: "Neoplasm of uncertain or unknown behaviour of skin",
    chapter: NEOPLASMS,
    group: "Uncertain behaviour",
  },
  // --- Benign neoplasms ----------------------------------------------------
  {
    code: "D22",
    name: "Melanocytic naevi",
    chapter: NEOPLASMS,
    group: "Benign",
    note: "Benign melanocytic lesions, including atypical and dysplastic naevi.",
  },
  {
    code: "D23",
    name: "Other benign neoplasms of skin",
    chapter: NEOPLASMS,
    group: "Benign",
    note: "Includes dermatofibroma and other benign non-melanocytic skin tumours.",
  },
  {
    code: "D18.0",
    name: "Haemangioma, any site",
    chapter: NEOPLASMS,
    group: "Benign",
    note: "Includes infantile haemangioma and cherry angioma.",
  },
  // --- Sun-related and keratinocyte disorders ------------------------------
  {
    code: "L57.0",
    name: "Actinic keratosis",
    chapter: SKIN,
    group: "Precancerous",
    note: "Subcategory of L57, skin changes due to chronic non-ionising radiation exposure.",
  },
  {
    code: "L82",
    name: "Seborrhoeic keratosis",
    chapter: SKIN,
    group: "Benign",
    note:
      "WHO ICD-10 places seborrhoeic keratosis in Chapter XII, not with the benign neoplasms in Chapter II.",
  },
  // --- Inflammatory and other dermatoses -----------------------------------
  {
    code: "L20",
    name: "Atopic dermatitis",
    chapter: SKIN,
    group: "Inflammatory",
    note: "Atopic eczema.",
  },
  {
    code: "L21",
    name: "Seborrhoeic dermatitis",
    chapter: SKIN,
    group: "Inflammatory",
  },
  {
    code: "L23",
    name: "Allergic contact dermatitis",
    chapter: SKIN,
    group: "Inflammatory",
  },
  {
    code: "L24",
    name: "Irritant contact dermatitis",
    chapter: SKIN,
    group: "Inflammatory",
  },
  {
    code: "L30",
    name: "Other dermatitis",
    chapter: SKIN,
    group: "Inflammatory",
    note: "Includes discoid and unspecified eczema.",
  },
  {
    code: "L40",
    name: "Psoriasis",
    chapter: SKIN,
    group: "Inflammatory",
  },
  {
    code: "L43",
    name: "Lichen planus",
    chapter: SKIN,
    group: "Inflammatory",
  },
  {
    code: "L70",
    name: "Acne",
    chapter: SKIN,
    group: "Inflammatory",
  },
  {
    code: "L71",
    name: "Rosacea",
    chapter: SKIN,
    group: "Inflammatory",
  },
  {
    code: "L50",
    name: "Urticaria",
    chapter: SKIN,
    group: "Inflammatory",
  },
  // --- Pigmentation, appendages and structure ------------------------------
  {
    code: "L72.0",
    name: "Epidermoid cyst",
    chapter: SKIN,
    group: "Benign",
  },
  {
    code: "L80",
    name: "Vitiligo",
    chapter: SKIN,
    group: "Pigmentation",
  },
  {
    code: "L81",
    name: "Other disorders of pigmentation",
    chapter: SKIN,
    group: "Pigmentation",
    note: "Includes melasma and post-inflammatory hyperpigmentation.",
  },
  {
    code: "L91.0",
    name: "Hypertrophic scar",
    chapter: SKIN,
    group: "Structural",
    note: "Includes keloid scar.",
  },
] as const;

// =============================================================================
// SNOMED CT -> WHO ICD-10
// Every concept in SNOMED_CONCEPTS has at least one row. Mappings are
// educational category-level approximations, not certified map rows; see
// TERMINOLOGY_PROVENANCE.snomedToIcd10.
// =============================================================================

const APPROX: MappingExactness = "approximate-category";

export const SNOMED_TO_ICD10: Readonly<Record<string, readonly Icd10MappingRow[]>> = {
  "372244006": [
    {
      icd10Code: "C43",
      exactness: APPROX,
      rationale:
        "Primary malignant melanoma of skin. Category level; ICD-10 subdivides C43 by anatomical site.",
    },
  ],
  "109264001": [
    {
      icd10Code: "D03",
      exactness: APPROX,
      rationale:
        "Melanoma confined to the epidermis is classified as melanoma in situ rather than under C43.",
    },
  ],
  "254651007": [
    {
      icd10Code: "C44",
      exactness: APPROX,
      rationale:
        "Basal cell carcinoma has no dedicated ICD-10 category; it is classified with other malignant skin neoplasms.",
    },
  ],
  "254652000": [
    {
      icd10Code: "C44",
      exactness: APPROX,
      rationale:
        "Invasive squamous cell carcinoma is classified with other malignant skin neoplasms.",
    },
    {
      icd10Code: "D04",
      exactness: APPROX,
      rationale:
        "Where the lesion is in situ (Bowen's disease), ICD-10 classifies it as carcinoma in situ of skin instead. The SNOMED concept alone does not distinguish the two.",
    },
  ],
  "92564006": [
    {
      icd10Code: "L57.0",
      exactness: APPROX,
      rationale:
        "ICD-10 places actinic keratosis with skin changes due to chronic non-ionising radiation exposure, in Chapter XII rather than with neoplasms.",
    },
  ],
  "254701007": [
    {
      icd10Code: "D22",
      exactness: APPROX,
      rationale:
        "WHO ICD-10 has no dedicated dysplastic naevus code; the lesion is classified with melanocytic naevi.",
    },
    {
      icd10Code: "D48.5",
      exactness: APPROX,
      rationale:
        "Some coding practice places atypical melanocytic lesions under neoplasm of uncertain behaviour. Both targets are in use, which is why this mapping is not one-to-one.",
    },
  ],
  "21119008": [
    {
      icd10Code: "D22",
      exactness: APPROX,
      rationale: "A common mole is a benign melanocytic naevus.",
    },
  ],
} as const;

// =============================================================================
// LOOKUPS
// =============================================================================

const CONCEPTS_BY_CODE = new Map(SNOMED_CONCEPTS.map((c) => [c.snomedCode, c]));
const ICD10_BY_CODE = new Map(ICD10_CATEGORIES.map((c) => [c.code, c]));

export function findConcept(snomedCode: string): BundledConcept | undefined {
  return CONCEPTS_BY_CODE.get(snomedCode.trim());
}

export function findIcd10(code: string): Icd10Category | undefined {
  return ICD10_BY_CODE.get(code.trim().toUpperCase());
}

export function conceptsByCategory(category: string): BundledConcept[] {
  const wanted = category.trim().toUpperCase();
  return SNOMED_CONCEPTS.filter((c) => c.category === wanted);
}

export function searchConcepts(query: string): BundledConcept[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...SNOMED_CONCEPTS];
  return SNOMED_CONCEPTS.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.snomedCode === q ||
      c.searchAliases.some((alias) => alias.includes(q) || q.includes(alias))
  );
}

export function icd10MappingsFor(snomedCode: string): readonly Icd10MappingRow[] {
  return SNOMED_TO_ICD10[snomedCode.trim()] ?? [];
}

/**
 * What this package actually covers. Returned alongside empty results so a
 * caller who asks for an unbundled code learns the shape of the subset
 * instead of receiving a bare empty array.
 */
export function terminologyCoverage() {
  return {
    bundledSnomedConcepts: SNOMED_CONCEPTS.map((c) => ({
      snomedCode: c.snomedCode,
      name: c.name,
    })),
    bundledIcd10CategoryCount: ICD10_CATEGORIES.length,
    note:
      "This server bundles a small educational subset, not a terminology release. " +
      "Every bundled SNOMED CT concept listed here resolves and maps to ICD-10. " +
      "ICD-10 coverage is broader than SNOMED coverage: expanding the bundled SNOMED " +
      "concept set is on hold pending a redistribution question with SNOMED International " +
      "(see MoleCare/molecare-mcp#49). Browse molecare://ontology/snomed-icd10-map for the " +
      "full mapping table.",
  };
}
