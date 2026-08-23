/**
 * Ontology API Client
 * ====================
 *
 * Communicates with the MoleCare backend to access the medical
 * ontology service (SNOMED CT and ICD-10 dermatology concepts).
 */

import axios, { AxiosInstance } from "axios";

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

interface RiskAssessment {
  presentRiskFactors: RiskFactor[];
  combinedRelativeRisk: number;
  overallRiskLevel: string;
  elevatedRiskConditions: Concept[];
  recommendation: string;
}

interface LesionFeatures {
  asymmetry?: boolean;
  irregularBorder?: boolean;
  multipleColors?: boolean;
  diameterMm?: number;
  hasChanged?: boolean;
  colorVariations?: string[];
  bodyPart?: string;
  riskFactorIds?: string[];
}

interface ClassificationResult {
  possibleConditions: {
    concept: Concept;
    matchScore: number;
    matchReason: string;
  }[];
  riskLevel: string;
  abcdeScore: number;
  recommendation: string;
  requiresProfessionalEvaluation: boolean;
}

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
      return response.data.data;
    } catch (error) {
      console.error("Failed to get risk factors:", error);
      return this.getMockRiskFactors();
    }
  }

  async assessRisk(riskFactorIds: string[]): Promise<RiskAssessment[]> {
    try {
      const response = await this.client.post<ApiResponse<RiskAssessment[]>>(
        `/risk-assessment`,
        { riskFactorIds }
      );
      return response.data.data;
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

  async classifyLesion(features: LesionFeatures): Promise<ClassificationResult> {
    try {
      const response = await this.client.post<ApiResponse<ClassificationResult>>(
        `/classify`,
        features
      );
      return response.data.data;
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
  // ==========================================================================

  private getMockConcept(snomedCode: string): Concept | null {
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
    const mappings: Record<string, Diagnosis[]> = {
      "372244006": [
        {
          icd10Code: "C43",
          name: "Malignant melanoma of skin",
          description: "Primary malignant melanoma",
          category: "Neoplasms",
          chapter: "Chapter II",
        },
      ],
      "21119008": [
        {
          icd10Code: "D22",
          name: "Melanocytic naevi",
          description: "Benign melanocytic lesions",
          category: "Neoplasms",
          chapter: "Chapter II",
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
        relativeRisk: 2.5,
      },
      {
        factorId: "FAMILY_HISTORY",
        name: "Family history of melanoma",
        description: "First-degree relative with melanoma",
        category: "GENETIC",
        relativeRisk: 3.0,
      },
      {
        factorId: "MANY_MOLES",
        name: "Many moles (50+)",
        description: "Having more than 50 common moles",
        category: "PHENOTYPIC",
        relativeRisk: 2.0,
      },
      {
        factorId: "UV_EXPOSURE",
        name: "Excessive UV exposure",
        description: "History of sunburns or tanning bed use",
        category: "ENVIRONMENTAL",
        relativeRisk: 2.0,
      },
    ];
  }

  private getMockRiskAssessment(riskFactorIds: string[]): RiskAssessment[] {
    const factors = this.getMockRiskFactors().filter((rf) =>
      riskFactorIds.includes(rf.factorId)
    );
    const combinedRisk = factors.reduce(
      (acc, rf) => acc * (rf.relativeRisk || 1),
      1
    );

    let riskLevel = "LOW";
    let recommendation = "Continue regular self-monitoring and sun protection";

    if (combinedRisk >= 5) {
      riskLevel = "HIGH";
      recommendation =
        "Schedule dermatologist appointment for full skin examination";
    } else if (combinedRisk >= 2) {
      riskLevel = "MODERATE";
      recommendation =
        "Perform regular self-examinations and annual dermatologist visits";
    }

    return [
      {
        presentRiskFactors: factors,
        combinedRelativeRisk: combinedRisk,
        overallRiskLevel: riskLevel,
        elevatedRiskConditions: [
          {
            snomedCode: "372244006",
            name: "Malignant melanoma of skin",
            description: "Skin cancer from melanocytes",
            category: "MALIGNANT",
            severity: "HIGH",
          },
        ],
        recommendation,
      },
    ];
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

  private getMockClassification(features: LesionFeatures): ClassificationResult {
    let abcdeScore = 0;
    if (features.asymmetry) abcdeScore++;
    if (features.irregularBorder) abcdeScore++;
    if (features.multipleColors) abcdeScore++;
    if (features.diameterMm && features.diameterMm > 6) abcdeScore++;
    if (features.hasChanged) abcdeScore++;

    let riskLevel = "LOW";
    let recommendation = "No concerning features. Continue regular monitoring.";
    let requiresProfessionalEvaluation = false;

    if (abcdeScore >= 3) {
      riskLevel = "HIGH";
      recommendation =
        "Multiple concerning features. Please consult a dermatologist promptly.";
      requiresProfessionalEvaluation = true;
    } else if (abcdeScore >= 1) {
      riskLevel = "MODERATE";
      recommendation =
        "Some concerning features. Consider dermatologist evaluation.";
      requiresProfessionalEvaluation = true;
    }

    return {
      possibleConditions:
        abcdeScore >= 3
          ? [
              {
                concept: {
                  snomedCode: "372244006",
                  name: "Malignant melanoma of skin",
                  description: "Skin cancer from melanocytes",
                  category: "MALIGNANT",
                  severity: "HIGH",
                },
                matchScore: 0.7,
                matchReason: "High ABCDE score",
              },
            ]
          : [
              {
                concept: {
                  snomedCode: "21119008",
                  name: "Pigmented nevus",
                  description: "Benign mole",
                  category: "BENIGN",
                  severity: "LOW",
                },
                matchScore: 0.8,
                matchReason: "Features consistent with benign mole",
              },
            ],
      riskLevel,
      abcdeScore,
      recommendation,
      requiresProfessionalEvaluation,
    };
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
