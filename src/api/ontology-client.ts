/**
 * Ontology API Client
 * ====================
 *
 * Communicates with the MoleCare backend to access the medical
 * ontology service (SNOMED CT and ICD-10 dermatology concepts).
 */

import axios, { AxiosInstance } from "axios";
import { describeError } from "../utils/safe-error.js";
import {
  educationalClassification,
  educationalRiskReview,
  sanitizeClassification,
  sanitizeRiskAssessments,
  type EducationalClassification,
  type EducationalRiskReview,
  type LesionFeatureInput,
  type NamedRiskFactor,
} from "../clinical-boundary.js";
import {
  TERMINOLOGY_PROVENANCE,
  type MappingExactness,
} from "../resources/terminology-provenance.js";

interface OntologyApiConfig {
  baseUrl: string;
  apiKey: string;
  /** Force bundled data regardless of the URL and key. Tests use this. */
  mockMode?: boolean;
}

interface Concept {
  snomedCode: string;
  name: string;
  description: string;
  category: string;
  severity: string;
  icd10Codes?: string[];
}

interface Diagnosis {
  icd10Code: string;
  name: string;
  description: string;
  category: string;
  chapter: string;
  /** Whether the SNOMED→ICD-10 link is exact or a category-level approximation. */
  mappingExactness?: MappingExactness;
  /** Named source for this mapping row. */
  source?: string;
}

interface RiskFactor {
  factorId: string;
  name: string;
  description: string;
  category: string;
  relativeRisk?: number;
}

interface Feature {
  featureId: string;
  name: string;
  description: string;
  category: string;
  indicationStrength?: string;
}

interface Progression {
  fromCondition: Concept;
  toCondition: Concept;
  likelihood: string;
  timeframe: string;
}

type LesionFeatures = LesionFeatureInput;

interface ApiResponse<T> {
  success: boolean;
  data: T;
  disclaimer: string;
  error?: string;
}

export type OntologyDataSource = "mock" | "ontology-api";

export class OntologyApiClient {
  private client: AxiosInstance;
  /** True when no backend is configured, so every answer is bundled data. */
  readonly mockMode: boolean;
  /** What every knowledge result reports as its origin. */
  readonly dataSource: OntologyDataSource;

  constructor(config: OntologyApiConfig) {
    // Same rule as MoleCareApiClient: a backend needs both a URL and a key.
    // Without them this serves bundled educational data and says so. With
    // them, a failure is an error, never bundled data wearing a real answer's
    // clothes.
    this.mockMode = config.mockMode ?? !(config.baseUrl && config.apiKey);
    this.dataSource = this.mockMode ? "mock" : "ontology-api";
    this.client = axios.create({
      baseURL: `${config.baseUrl}/v1/ontology`,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });
  }

  // ==========================================================================
  // CONCEPT OPERATIONS
  // ==========================================================================

  async getConceptBySnomedCode(snomedCode: string): Promise<Concept | null> {
    if (this.mockMode) return this.getMockConcept(snomedCode);
    try {
      const response = await this.client.get<ApiResponse<Concept>>(
        `/concepts/${snomedCode}`
      );
      return response.data.data;
    } catch (error) {
      throw this.apiError("get concept", error);
    }
  }

  async searchConcepts(query: string): Promise<Concept[]> {
    if (this.mockMode) return this.getMockSearchResults(query);
    try {
      const response = await this.client.get<ApiResponse<Concept[]>>(
        `/concepts/search`,
        { params: { q: query } }
      );
      return response.data.data;
    } catch (error) {
      throw this.apiError("search concepts", error);
    }
  }

  async getConceptsByCategory(category: string): Promise<Concept[]> {
    if (this.mockMode) return this.getMockConceptsByCategory(category);
    try {
      const response = await this.client.get<ApiResponse<Concept[]>>(
        `/concepts/category/${category}`
      );
      return response.data.data;
    } catch (error) {
      throw this.apiError("get concepts by category", error);
    }
  }

  async getProgressionPaths(snomedCode: string): Promise<Progression[]> {
    if (this.mockMode) return this.getMockProgressions(snomedCode);
    try {
      const response = await this.client.get<ApiResponse<Progression[]>>(
        `/concepts/${snomedCode}/progressions`
      );
      return response.data.data;
    } catch (error) {
      throw this.apiError("get progressions", error);
    }
  }

  // ==========================================================================
  // DIAGNOSIS OPERATIONS
  // ==========================================================================

  async mapSnomedToIcd10(snomedCode: string): Promise<Diagnosis[]> {
    if (this.mockMode) return this.getMockIcd10Mappings(snomedCode);
    try {
      const response = await this.client.get<ApiResponse<Diagnosis[]>>(
        `/concepts/${snomedCode}/icd10`
      );
      return response.data.data;
    } catch (error) {
      throw this.apiError("map SNOMED to ICD-10", error);
    }
  }

  // ==========================================================================
  // RISK FACTOR OPERATIONS
  // ==========================================================================

  async getRiskFactorsForCondition(snomedCode: string): Promise<RiskFactor[]> {
    if (this.mockMode) return this.withoutRelativeRisk(this.getMockRiskFactors());
    try {
      const response = await this.client.get<ApiResponse<RiskFactor[]>>(
        `/concepts/${snomedCode}/risk-factors`
      );
      return this.withoutRelativeRisk(response.data.data);
    } catch (error) {
      throw this.apiError("get risk factors", error);
    }
  }

  private withoutRelativeRisk(factors: RiskFactor[]): RiskFactor[] {
    return factors.map(({ factorId, name, description, category }) => ({
      factorId,
      name,
      description,
      category,
    }));
  }

  async assessRisk(riskFactorIds: string[]): Promise<EducationalRiskReview> {
    const named = this.namedFactorsFromIds(riskFactorIds);
    if (this.mockMode) return this.getMockRiskAssessment(riskFactorIds);
    try {
      const response = await this.client.post<ApiResponse<unknown>>(
        `/risk-assessment`,
        { riskFactorIds }
      );
      return sanitizeRiskAssessments(
        this.namedFactorsFromRaw(response.data.data, named),
        response.data.data
      );
    } catch (error) {
      throw this.apiError("assess risk", error);
    }
  }

  // ==========================================================================
  // FEATURE OPERATIONS
  // ==========================================================================

  async getAbcdeCriteria(): Promise<Feature[]> {
    if (this.mockMode) return this.getMockAbcdeCriteria();
    try {
      const response = await this.client.get<ApiResponse<Feature[]>>(
        `/features/abcde`
      );
      return response.data.data;
    } catch (error) {
      throw this.apiError("get ABCDE criteria", error);
    }
  }

  async getFeaturesForCondition(snomedCode: string): Promise<Feature[]> {
    if (this.mockMode) return [];
    try {
      const response = await this.client.get<ApiResponse<Feature[]>>(
        `/concepts/${snomedCode}/features`
      );
      return response.data.data;
    } catch (error) {
      throw this.apiError("get features", error);
    }
  }

  // ==========================================================================
  // CLASSIFICATION OPERATIONS
  // ==========================================================================

  async classifyLesion(
    features: LesionFeatures
  ): Promise<EducationalClassification> {
    if (this.mockMode) return this.getMockClassification(features);
    try {
      const response = await this.client.post<ApiResponse<unknown>>(
        `/classify`,
        features
      );
      return sanitizeClassification(features, response.data.data);
    } catch (error) {
      throw this.apiError("classify lesion", error);
    }
  }

  async getMalignantConditions(): Promise<Concept[]> {
    if (this.mockMode) return this.getMockMalignantConditions();
    try {
      const response = await this.client.get<ApiResponse<Concept[]>>(
        `/concepts/malignant`
      );
      return response.data.data;
    } catch (error) {
      throw this.apiError("get malignant conditions", error);
    }
  }

  /**
   * A backend failure surfaces as an error the tool runtime turns into an
   * isError result. It never becomes bundled data: a caller who configured a
   * real ontology must not receive canned clinical answers that did not come
   * from it. The message carries the HTTP status, never the response body.
   */
  private apiError(operation: string, error: unknown): Error {
    if (error instanceof Error && !axios.isAxiosError(error)) return error;
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    const reason = status ? `HTTP ${status}` : "the backend could not be reached";
    return new Error(`Ontology API ${operation} failed: ${reason}`);
  }

  // ==========================================================================
  // MOCK DATA - For development/testing
  // Provenance: see TERMINOLOGY_PROVENANCE in terminology-provenance.ts
  // ==========================================================================

  /**
   * The bundled SNOMED CT concepts, in one table. Lookup, search, category,
   * progression and the malignant list are all derived from it, so a concept
   * cannot be handed out by one path and unknown to another. That is how
   * melanoma in situ came to be MALIGNANT in the resource and reachable
   * through progression, yet absent from lookup and the malignant list.
   * Names are checked against SNOMED CT by tests/terminology.test.mjs.
   */
  private static readonly MOCK_CONCEPTS: Record<string, Concept> = {
    "93655004": {
      snomedCode: "93655004",
      name: "Malignant melanoma of skin",
      description: "The most serious type of skin cancer that develops from pigment-producing cells",
      category: "MALIGNANT",
      severity: "HIGH",
    },
    "109266006": {
      snomedCode: "109266006",
      name: "Melanoma in situ of skin",
      description: "Early melanoma confined to the epidermis",
      category: "MALIGNANT",
      severity: "MODERATE",
    },
    "254701007": {
      snomedCode: "254701007",
      name: "Basal cell carcinoma of skin",
      description: "Most common type of skin cancer",
      category: "MALIGNANT",
      severity: "MODERATE",
    },
    "254651007": {
      snomedCode: "254651007",
      name: "Squamous cell carcinoma of skin",
      description: "Second most common type of skin cancer",
      category: "MALIGNANT",
      severity: "MODERATE",
    },
    "254818000": {
      snomedCode: "254818000",
      name: "Dysplastic nevus",
      description: "Atypical mole with some concerning features",
      category: "PRECANCEROUS",
      severity: "MODERATE",
    },
    "201101007": {
      snomedCode: "201101007",
      name: "Actinic keratosis",
      description: "Pre-cancerous scaly patch from sun damage",
      category: "PRECANCEROUS",
      severity: "MODERATE",
    },
    "400010006": {
      snomedCode: "400010006",
      name: "Melanocytic naevus of skin",
      description: "A benign growth of melanocytes (pigment cells)",
      category: "BENIGN",
      severity: "LOW",
    },
  };

  private getMockConcept(snomedCode: string): Concept | null {
    return OntologyApiClient.MOCK_CONCEPTS[snomedCode] || null;
  }

  private getMockSearchResults(query: string): Concept[] {
    const lowerQuery = query.toLowerCase();
    return Object.values(OntologyApiClient.MOCK_CONCEPTS).filter(
      (c) =>
        c.name.toLowerCase().includes(lowerQuery) ||
        c.description.toLowerCase().includes(lowerQuery)
    );
  }

  private getMockConceptsByCategory(category: string): Concept[] {
    return Object.values(OntologyApiClient.MOCK_CONCEPTS).filter((c) => c.category === category);
  }

  private getMockProgressions(snomedCode: string): Progression[] {
    if (snomedCode === "254818000") {
      const fromCondition = this.getMockConcept("254818000");
      const toCondition = this.getMockConcept("109266006");
      if (!fromCondition || !toCondition) return [];
      return [{ fromCondition, toCondition, likelihood: "POSSIBLE", timeframe: "MONTHS_TO_YEARS" }];
    }
    return [];
  }

  private getMockIcd10Mappings(snomedCode: string): Diagnosis[] {
    // Category-level WHO ICD-10 mappings (see TERMINOLOGY_PROVENANCE.snomedToIcd10).
    const approx = TERMINOLOGY_PROVENANCE.snomedToIcd10.exactness;
    const source =
      `${TERMINOLOGY_PROVENANCE.snomedCt.edition}; ` +
      `${TERMINOLOGY_PROVENANCE.icd10.revision}; ` +
      `last checked ${TERMINOLOGY_PROVENANCE.snomedCt.lastChecked}`;
    const mappings: Record<string, Diagnosis[]> = {
      "93655004": [
        {
          icd10Code: "C43",
          name: "Malignant melanoma of skin",
          description: "Primary malignant melanoma (category-level; not site-specific)",
          category: "Neoplasms",
          chapter: "Chapter II",
          mappingExactness: approx,
          source,
        },
      ],
      "400010006": [
        {
          icd10Code: "D22",
          name: "Melanocytic naevi",
          description: "Benign melanocytic lesions (category-level)",
          category: "Neoplasms",
          chapter: "Chapter II",
          mappingExactness: approx,
          source,
        },
      ],
    };
    return mappings[snomedCode] || [];
  }

  private getMockRiskFactors(): RiskFactor[] {
    return [
      {
        factorId: "FAIR_SKIN",
        name: "Fair skin (Fitzpatrick Type I-II)",
        description: "Light skin that burns easily",
        category: "GENETIC",
      },
      {
        factorId: "FAMILY_HISTORY",
        name: "Family history of melanoma",
        description: "First-degree relative with melanoma",
        category: "GENETIC",
      },
      {
        factorId: "MANY_MOLES",
        name: "Many moles (50+)",
        description: "Having more than 50 common moles",
        category: "PHENOTYPIC",
      },
      {
        factorId: "UV_EXPOSURE",
        name: "Excessive UV exposure",
        description: "History of sunburns or tanning bed use",
        category: "ENVIRONMENTAL",
      },
    ];
  }

  private namedFactorsFromIds(riskFactorIds: string[]): NamedRiskFactor[] {
    // Not a substitute for a backend: this is a lookup table that turns ids the
    // caller supplied into names.
    //
    // The array check is load-bearing. Given a string, Array.includes below
    // becomes String.includes, which does a substring match, so
    // riskFactorIds: "FAIR_SKIN_EXTRA" used to report FAIR_SKIN as a factor the
    // caller never named. Attributing a skin-health risk factor to someone who
    // does not have one is exactly the kind of quiet wrong answer this server
    // must not produce.
    if (!Array.isArray(riskFactorIds)) {
      throw new Error(
        `riskFactorIds must be an array of factor ids, received ${typeof riskFactorIds}`,
      );
    }
    return this.getMockRiskFactors()
      .filter((rf) => riskFactorIds.includes(rf.factorId))
      .map(({ factorId, name, description }) => ({
        factorId,
        name,
        description,
      }));
  }

  private namedFactorsFromRaw(
    raw: unknown,
    fallback: NamedRiskFactor[]
  ): NamedRiskFactor[] {
    if (!Array.isArray(raw)) return fallback;
    const collected: NamedRiskFactor[] = [];
    for (const item of raw) {
      if (!item || typeof item !== "object" || !("presentRiskFactors" in item)) {
        continue;
      }
      const present = (item as { presentRiskFactors?: unknown })
        .presentRiskFactors;
      if (!Array.isArray(present)) continue;
      for (const factor of present) {
        if (!factor || typeof factor !== "object" || !("factorId" in factor)) {
          continue;
        }
        const rec = factor as {
          factorId: string;
          name?: string;
          description?: string;
        };
        collected.push({
          factorId: rec.factorId,
          name: rec.name ?? rec.factorId,
          description: rec.description ?? "",
        });
      }
    }
    return collected.length ? collected : fallback;
  }

  private getMockRiskAssessment(riskFactorIds: string[]): EducationalRiskReview {
    return educationalRiskReview(this.namedFactorsFromIds(riskFactorIds));
  }

  private getMockAbcdeCriteria(): Feature[] {
    return [
      {
        featureId: "ASYMMETRY",
        name: "Asymmetry",
        description: "One half doesn't match the other",
        category: "ABCDE",
      },
      {
        featureId: "BORDER",
        name: "Border irregularity",
        description: "Edges are ragged, notched, or blurred",
        category: "ABCDE",
      },
      {
        featureId: "COLOR",
        name: "Color variation",
        description: "Multiple colors or uneven distribution",
        category: "ABCDE",
      },
      {
        featureId: "DIAMETER",
        name: "Diameter > 6mm",
        description: "Larger than a pencil eraser",
        category: "ABCDE",
      },
      {
        featureId: "EVOLUTION",
        name: "Evolution",
        description: "Changes in size, shape, or color",
        category: "ABCDE",
      },
    ];
  }

  private getMockClassification(
    features: LesionFeatures
  ): EducationalClassification {
    return educationalClassification(features);
  }

  private getMockMalignantConditions(): Concept[] {
    return this.getMockConceptsByCategory("MALIGNANT");
  }
}
