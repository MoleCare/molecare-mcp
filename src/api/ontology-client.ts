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
import {
  conceptsByCategory,
  findConcept,
  findIcd10,
  icd10MappingsFor,
  searchConcepts as searchBundledConcepts,
  type BundledConcept,
} from "../resources/terminology-data.js";

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
  // BUNDLED DATA - answers every request when the backend is unreachable
  //
  // All of it comes from `src/resources/terminology-data.ts`, so a concept
  // advertised by a `molecare://ontology/*` resource always resolves here too.
  // Provenance: see TERMINOLOGY_PROVENANCE in terminology-provenance.ts
  // ==========================================================================

  /** Shape a bundled concept as the wire `Concept`, including its ICD-10 targets. */
  private toConcept(concept: BundledConcept): Concept {
    const icd10Codes = icd10MappingsFor(concept.snomedCode).map(
      (row) => row.icd10Code
    );
    return {
      snomedCode: concept.snomedCode,
      name: concept.name,
      description: concept.description,
      category: concept.category,
      severity: concept.severity,
      ...(icd10Codes.length ? { icd10Codes } : {}),
    };
  }

  private getMockConcept(snomedCode: string): Concept | null {
    const concept = findConcept(snomedCode);
    return concept ? this.toConcept(concept) : null;
  }

  private getMockSearchResults(query: string): Concept[] {
    return searchBundledConcepts(query).map((c) => this.toConcept(c));
  }

  private getMockConceptsByCategory(category: string): Concept[] {
    return conceptsByCategory(category).map((c) => this.toConcept(c));
  }

  private getMockProgressions(snomedCode: string): Progression[] {
    const paths = BUNDLED_PROGRESSIONS[snomedCode.trim()] ?? [];
    return paths.flatMap(({ to, likelihood, timeframe }) => {
      const from = findConcept(snomedCode);
      const target = findConcept(to);
      if (!from || !target) return [];
      return [
        {
          fromCondition: this.toConcept(from),
          toCondition: this.toConcept(target),
          likelihood,
          timeframe,
        },
      ];
    });
  }

  private getMockIcd10Mappings(snomedCode: string): Diagnosis[] {
    const source =
      `${TERMINOLOGY_PROVENANCE.snomedCt.edition}; ` +
      `${TERMINOLOGY_PROVENANCE.icd10.revision}; ` +
      `last checked ${TERMINOLOGY_PROVENANCE.snomedCt.lastChecked}`;

    return icd10MappingsFor(snomedCode).flatMap((row) => {
      const category = findIcd10(row.icd10Code);
      if (!category) return [];
      return [
        {
          icd10Code: category.code,
          name: category.name,
          description: row.rationale,
          category: category.group,
          chapter: category.chapter,
          mappingExactness: row.exactness,
          source,
        },
      ];
    });
  }

  private getMockMalignantConditions(): Concept[] {
    return this.getMockConceptsByCategory("MALIGNANT");
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
}

/**
 * Progression paths between bundled concepts, keyed by source concept.
 * Educational only: progression is not inevitable, and these describe
 * recognised sequences rather than a prediction about any individual lesion.
 */
const BUNDLED_PROGRESSIONS: Record<
  string,
  ReadonlyArray<{ to: string; likelihood: string; timeframe: string }>
> = {
  "254818000": [
    { to: "109266006", likelihood: "POSSIBLE", timeframe: "MONTHS_TO_YEARS" },
  ],
  "109266006": [
    { to: "93655004", likelihood: "POSSIBLE", timeframe: "MONTHS_TO_YEARS" },
  ],
  "201101007": [
    { to: "254651007", likelihood: "POSSIBLE", timeframe: "YEARS" },
  ],
};
