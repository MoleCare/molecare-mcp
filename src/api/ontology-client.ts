/**
 * Ontology API Client
 * ====================
 *
 * Communicates with the MoleCare backend to access the medical
 * ontology service (SNOMED CT and ICD-10 dermatology concepts).
 */

import axios, { AxiosInstance } from "axios";
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

export class OntologyApiClient {
  private client: AxiosInstance;

  constructor(config: OntologyApiConfig) {
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
    try {
      const response = await this.client.get<ApiResponse<Concept>>(
        `/concepts/${snomedCode}`
      );
      return response.data.data;
    } catch (error) {
      console.error("Failed to get concept:", error);
      return this.getMockConcept(snomedCode);
    }
  }

  async searchConcepts(query: string): Promise<Concept[]> {
    try {
      const response = await this.client.get<ApiResponse<Concept[]>>(
        `/concepts/search`,
        { params: { q: query } }
      );
      return response.data.data;
    } catch (error) {
      console.error("Failed to search concepts:", error);
      return this.getMockSearchResults(query);
    }
  }

  async getConceptsByCategory(category: string): Promise<Concept[]> {
    try {
      const response = await this.client.get<ApiResponse<Concept[]>>(
        `/concepts/category/${category}`
      );
      return response.data.data;
    } catch (error) {
      console.error("Failed to get concepts by category:", error);
      return this.getMockConceptsByCategory(category);
    }
  }

  async getProgressionPaths(snomedCode: string): Promise<Progression[]> {
    try {
      const response = await this.client.get<ApiResponse<Progression[]>>(
        `/concepts/${snomedCode}/progressions`
      );
      return response.data.data;
    } catch (error) {
      console.error("Failed to get progressions:", error);
      return this.getMockProgressions(snomedCode);
    }
  }

  // ==========================================================================
  // DIAGNOSIS OPERATIONS
  // ==========================================================================

  async mapSnomedToIcd10(snomedCode: string): Promise<Diagnosis[]> {
    try {
      const response = await this.client.get<ApiResponse<Diagnosis[]>>(
        `/concepts/${snomedCode}/icd10`
      );
      return response.data.data;
    } catch (error) {
      console.error("Failed to map SNOMED to ICD-10:", error);
      return this.getMockIcd10Mappings(snomedCode);
    }
  }

  // ==========================================================================
  // RISK FACTOR OPERATIONS
  // ==========================================================================

  async getRiskFactorsForCondition(snomedCode: string): Promise<RiskFactor[]> {
    try {
      const response = await this.client.get<ApiResponse<RiskFactor[]>>(
        `/concepts/${snomedCode}/risk-factors`
      );
      return this.withoutRelativeRisk(response.data.data);
    } catch (error) {
      console.error("Failed to get risk factors:", error);
      return this.withoutRelativeRisk(this.getMockRiskFactors());
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
      console.error("Failed to assess risk:", error);
      return this.getMockRiskAssessment(riskFactorIds);
    }
  }

  // ==========================================================================
  // FEATURE OPERATIONS
  // ==========================================================================

  async getAbcdeCriteria(): Promise<Feature[]> {
    try {
      const response = await this.client.get<ApiResponse<Feature[]>>(
        `/features/abcde`
      );
      return response.data.data;
    } catch (error) {
      console.error("Failed to get ABCDE criteria:", error);
      return this.getMockAbcdeCriteria();
    }
  }

  async getFeaturesForCondition(snomedCode: string): Promise<Feature[]> {
    try {
      const response = await this.client.get<ApiResponse<Feature[]>>(
        `/concepts/${snomedCode}/features`
      );
      return response.data.data;
    } catch (error) {
      console.error("Failed to get features:", error);
      return [];
    }
  }

  // ==========================================================================
  // CLASSIFICATION OPERATIONS
  // ==========================================================================

  async classifyLesion(
    features: LesionFeatures
  ): Promise<EducationalClassification> {
    try {
      const response = await this.client.post<ApiResponse<unknown>>(
        `/classify`,
        features
      );
      return sanitizeClassification(features, response.data.data);
    } catch (error) {
      console.error("Failed to classify lesion:", error);
      return this.getMockClassification(features);
    }
  }

  async getMalignantConditions(): Promise<Concept[]> {
    try {
      const response = await this.client.get<ApiResponse<Concept[]>>(
        `/concepts/malignant`
      );
      return response.data.data;
    } catch (error) {
      console.error("Failed to get malignant conditions:", error);
      return this.getMockMalignantConditions();
    }
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
  "254701007": [
    { to: "109264001", likelihood: "POSSIBLE", timeframe: "MONTHS_TO_YEARS" },
  ],
  "109264001": [
    { to: "372244006", likelihood: "POSSIBLE", timeframe: "MONTHS_TO_YEARS" },
  ],
  "92564006": [
    { to: "254652000", likelihood: "POSSIBLE", timeframe: "YEARS" },
  ],
};
