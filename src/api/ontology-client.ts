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
      return [];
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
  // MOCK DATA - For development/testing
  // Provenance: see TERMINOLOGY_PROVENANCE in terminology-provenance.ts
  // ==========================================================================

  private getMockConcept(snomedCode: string): Concept | null {
    // SNOMED CT International Edition concepts (see TERMINOLOGY_PROVENANCE.snomedCt).
    const concepts: Record<string, Concept> = {
      "372244006": {
        snomedCode: "372244006",
        name: "Malignant melanoma of skin",
        description: "The most serious type of skin cancer that develops from pigment-producing cells",
        category: "MALIGNANT",
        severity: "HIGH",
      },
      "21119008": {
        snomedCode: "21119008",
        name: "Pigmented nevus",
        description: "A benign growth of melanocytes (pigment cells)",
        category: "BENIGN",
        severity: "LOW",
      },
      "254701007": {
        snomedCode: "254701007",
        name: "Dysplastic nevus",
        description: "Atypical mole with some concerning features",
        category: "PRECANCEROUS",
        severity: "MODERATE",
      },
    };
    return concepts[snomedCode] || null;
  }

  private getMockSearchResults(query: string): Concept[] {
    const lowerQuery = query.toLowerCase();
    const allConcepts = [
      {
        snomedCode: "372244006",
        name: "Malignant melanoma of skin",
        description: "Serious skin cancer from melanocytes",
        category: "MALIGNANT",
        severity: "HIGH",
      },
      {
        snomedCode: "21119008",
        name: "Pigmented nevus",
        description: "Benign mole",
        category: "BENIGN",
        severity: "LOW",
      },
      {
        snomedCode: "254701007",
        name: "Dysplastic nevus",
        description: "Atypical mole",
        category: "PRECANCEROUS",
        severity: "MODERATE",
      },
    ];
    return allConcepts.filter(
      (c) =>
        c.name.toLowerCase().includes(lowerQuery) ||
        c.description.toLowerCase().includes(lowerQuery)
    );
  }

  private getMockProgressions(snomedCode: string): Progression[] {
    if (snomedCode === "254701007") {
      return [
        {
          fromCondition: {
            snomedCode: "254701007",
            name: "Dysplastic nevus",
            description: "Atypical mole",
            category: "PRECANCEROUS",
            severity: "MODERATE",
          },
          toCondition: {
            snomedCode: "109264001",
            name: "Melanoma in situ",
            description: "Early melanoma confined to epidermis",
            category: "PRECANCEROUS",
            severity: "MODERATE",
          },
          likelihood: "POSSIBLE",
          timeframe: "MONTHS_TO_YEARS",
        },
      ];
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
      "372244006": [
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
      "21119008": [
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
    return [
      {
        snomedCode: "372244006",
        name: "Malignant melanoma of skin",
        description: "Skin cancer arising from melanocytes",
        category: "MALIGNANT",
        severity: "HIGH",
      },
      {
        snomedCode: "254651007",
        name: "Basal cell carcinoma",
        description: "Most common type of skin cancer",
        category: "MALIGNANT",
        severity: "MODERATE",
      },
      {
        snomedCode: "254652000",
        name: "Squamous cell carcinoma",
        description: "Second most common skin cancer",
        category: "MALIGNANT",
        severity: "MODERATE",
      },
    ];
  }
}
