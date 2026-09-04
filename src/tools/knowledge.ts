/**
 * Educational dermatology tools for the public MCP bridge.
 *
 * Local knowledge search plus ontology lookups. No clinical verdicts.
 */

import type { OntologyApiClient } from "../api/ontology-client.js";
import {
  EDUCATIONAL_ONLY_NOTE,
  EDUCATIONAL_RISK_NOTE,
} from "../clinical-boundary.js";
import type { MedicalKnowledgeBase } from "../resources/medical-kb.js";
import { TERMINOLOGY_PROVENANCE } from "../resources/terminology-provenance.js";

export const searchMedicalInfoTool = {
  name: "search_medical_info",
  annotations: { readOnlyHint: true, openWorldHint: false },
  description:
    "Search the medical knowledge base for skin health information. Use this to provide accurate educational content about skin conditions, ABCDE criteria, and prevention tips.",
  inputSchema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: "Search query (e.g., 'asymmetry', 'melanoma', 'sunscreen')",
      },
    },
    required: ["query"],
  },
};

export const ontologyTools = [
  {
    name: "lookup_medical_concept",
    annotations: { readOnlyHint: true, openWorldHint: true },
    description:
      "Look up a medical concept by SNOMED CT code. Returns detailed information about skin conditions including severity and category. Use this to provide accurate medical terminology.",
    inputSchema: {
      type: "object" as const,
      properties: {
        snomedCode: {
          type: "string",
          description: "SNOMED CT code (e.g., '372244006' for melanoma)",
        },
      },
      required: ["snomedCode"],
    },
  },
  {
    name: "search_medical_concepts",
    annotations: { readOnlyHint: true, openWorldHint: true },
    description:
      "Search for medical concepts by name or description. Returns matching SNOMED CT concepts for dermatology conditions.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search term (e.g., 'melanoma', 'nevus', 'mole')",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_condition_progression",
    annotations: { readOnlyHint: true, openWorldHint: true },
    description:
      "Get information about how a skin condition can progress. Shows potential progression paths (e.g., dysplastic nevus to melanoma).",
    inputSchema: {
      type: "object" as const,
      properties: {
        snomedCode: {
          type: "string",
          description: "SNOMED CT code of the condition",
        },
      },
      required: ["snomedCode"],
    },
  },
  {
    name: "map_snomed_to_icd10",
    annotations: { readOnlyHint: true, openWorldHint: true },
    description:
      "Map a SNOMED CT code to ICD-10 diagnosis codes. Useful for understanding official diagnosis classifications.",
    inputSchema: {
      type: "object" as const,
      properties: {
        snomedCode: {
          type: "string",
          description: "SNOMED CT code to map",
        },
      },
      required: ["snomedCode"],
    },
  },
  {
    name: "get_condition_risk_factors",
    annotations: { readOnlyHint: true, openWorldHint: true },
    description:
      "Get risk factors associated with a specific condition. Returns factors like family history, skin type, UV exposure.",
    inputSchema: {
      type: "object" as const,
      properties: {
        snomedCode: {
          type: "string",
          description: "SNOMED CT code of the condition",
        },
      },
      required: ["snomedCode"],
    },
  },
  {
    name: "assess_risk_from_factors",
    annotations: { readOnlyHint: true, openWorldHint: true },
    description:
      "Describe named educational skin-health factors from a list of factor IDs. Does not calculate a risk score or recommend urgency.",
    inputSchema: {
      type: "object" as const,
      properties: {
        riskFactorIds: {
          type: "array",
          items: { type: "string" },
          description:
            "Array of risk factor IDs (e.g., ['FAIR_SKIN', 'FAMILY_HISTORY', 'UV_EXPOSURE'])",
        },
      },
      required: ["riskFactorIds"],
    },
  },
  {
    name: "classify_lesion_features",
    annotations: { readOnlyHint: true, openWorldHint: true },
    description:
      "Describe which ABCDE criteria were supplied for a lesion. Educational only — does not name a condition, assign a risk level, or recommend urgency.",
    inputSchema: {
      type: "object" as const,
      properties: {
        asymmetry: {
          type: "boolean",
          description: "Is the lesion asymmetric?",
        },
        irregularBorder: {
          type: "boolean",
          description: "Does it have irregular borders?",
        },
        multipleColors: {
          type: "boolean",
          description: "Does it have multiple colors?",
        },
        diameterMm: {
          type: "number",
          description: "Diameter in millimeters",
        },
        hasChanged: {
          type: "boolean",
          description: "Has it changed over time?",
        },
      },
      required: [],
    },
  },
  {
    name: "get_malignant_conditions",
    annotations: { readOnlyHint: true, openWorldHint: true },
    description:
      "Get a list of all malignant skin conditions in the ontology. Use for educational purposes about skin cancers.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
];

export const knowledgeToolCosts: Record<string, number> = {
  search_medical_info: 1,
  lookup_medical_concept: 1,
  search_medical_concepts: 1,
  get_condition_progression: 1,
  map_snomed_to_icd10: 1,
  get_condition_risk_factors: 1,
  get_malignant_conditions: 1,
  assess_risk_from_factors: 2,
  classify_lesion_features: 3,
};

export async function dispatchKnowledgeTool(
  ontologyClient: OntologyApiClient,
  medicalKB: MedicalKnowledgeBase,
  name: string,
  args: Record<string, unknown>
) {
  switch (name) {
    case "search_medical_info": {
      const results = medicalKB.search(args.query as string);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                query: args.query,
                results,
                disclaimer:
                  "This information is for educational purposes only and does not constitute medical advice. Please consult a healthcare professional for medical concerns.",
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "lookup_medical_concept": {
      const concept = await ontologyClient.getConceptBySnomedCode(
        args.snomedCode as string
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                concept,
                disclaimer:
                  "This information is for educational purposes only and does not constitute medical advice.",
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "search_medical_concepts": {
      const concepts = await ontologyClient.searchConcepts(args.query as string);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                query: args.query,
                resultsCount: concepts.length,
                concepts,
                disclaimer:
                  "This information is for educational purposes only and does not constitute medical advice.",
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "get_condition_progression": {
      const progressions = await ontologyClient.getProgressionPaths(
        args.snomedCode as string
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                snomedCode: args.snomedCode,
                progressionPaths: progressions,
                note: "Progression is not inevitable. Many conditions remain stable with proper monitoring and care.",
                disclaimer:
                  "This information is for educational purposes only and does not constitute medical advice.",
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "map_snomed_to_icd10": {
      const diagnoses = await ontologyClient.mapSnomedToIcd10(
        args.snomedCode as string
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                snomedCode: args.snomedCode,
                icd10Mappings: diagnoses,
                provenance: TERMINOLOGY_PROVENANCE,
                disclaimer:
                  "This information is for educational purposes only and does not constitute medical advice.",
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "get_condition_risk_factors": {
      const riskFactors = await ontologyClient.getRiskFactorsForCondition(
        args.snomedCode as string
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                snomedCode: args.snomedCode,
                riskFactors,
                note: "Having risk factors does not mean you will develop the condition. Many people with risk factors never develop skin cancer.",
                disclaimer:
                  "This information is for educational purposes only and does not constitute medical advice.",
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "assess_risk_from_factors": {
      const review = await ontologyClient.assessRisk(
        args.riskFactorIds as string[]
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                inputFactors: args.riskFactorIds,
                review,
                disclaimer: EDUCATIONAL_RISK_NOTE,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "classify_lesion_features": {
      const classification = await ontologyClient.classifyLesion({
        asymmetry: args.asymmetry as boolean,
        irregularBorder: args.irregularBorder as boolean,
        multipleColors: args.multipleColors as boolean,
        diameterMm: args.diameterMm as number,
        hasChanged: args.hasChanged as boolean,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                inputFeatures: {
                  asymmetry: args.asymmetry,
                  irregularBorder: args.irregularBorder,
                  multipleColors: args.multipleColors,
                  diameterMm: args.diameterMm,
                  hasChanged: args.hasChanged,
                },
                classification,
                disclaimer: EDUCATIONAL_ONLY_NOTE,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "get_malignant_conditions": {
      const conditions = await ontologyClient.getMalignantConditions();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                conditions,
                count: conditions.length,
                note: "Early detection is key. Regular skin self-examinations and professional screenings can help identify concerning changes early.",
                disclaimer:
                  "This information is for educational purposes only and does not constitute medical advice.",
              },
              null,
              2
            ),
          },
        ],
      };
    }

    default:
      return undefined;
  }
}
