import "dotenv/config";
/**
 * MoleCare MCP Server
 * ====================
 *
 * A bridge between the MoleCare API and any MCP-capable client.
 *
 * Two kinds of tool live here:
 * - Dermatology knowledge that works with no credentials at all (lesion
 *   terminology, ABCDE criteria, SNOMED CT to ICD-10 mapping).
 * - Mole and profile data, which reaches a real backend only when
 *   MOLECARE_API_URL and MOLECARE_API_KEY are set. Treat that as PHI.
 *
 * Infrastructure, MLOps and CI/CD tooling lives in a separate binary,
 * `molecare-ops-mcp` (src/ops.ts). It is internal to MoleCare and returns
 * mock data without credentials, so it does not belong in this tool list.
 *
 * Usage:
 *   npm run build && npm start
 *   npm run dev   (watch mode)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { MoleCareApiClient } from "./api/molecare-client.js";
import { OntologyApiClient } from "./api/ontology-client.js";
import { EDUCATIONAL_ONLY_NOTE, EDUCATIONAL_RISK_NOTE } from "./clinical-boundary.js";
import { MedicalKnowledgeBase } from "./resources/medical-kb.js";
import {
  compareMolesTool,
  dispatchMoleTool,
  moleToolCosts,
  moleToolsBeforeSearch,
} from "./tools/moles.js";
import { TERMINOLOGY_PROVENANCE } from "./resources/terminology-provenance.js";

// Utilities
import { cache, CACHE_TTL } from "./utils/cache.js";
import { logger } from "./utils/logger.js";
import { registerTools, startServer, type ToolContext } from "./runtime.js";


// Initialize API client
const apiClient = new MoleCareApiClient({
  baseUrl: process.env.MOLECARE_API_URL || "http://localhost:8080/api",
  apiKey: process.env.MOLECARE_API_KEY || "",
});

// Initialize Ontology client
const ontologyClient = new OntologyApiClient({
  baseUrl: process.env.MOLECARE_API_URL || "http://localhost:8080/api",
  apiKey: process.env.MOLECARE_API_KEY || "",
});

// Initialize knowledge base
const medicalKB = new MedicalKnowledgeBase();

// Create MCP server
const server = new Server(
  {
    name: "molecare-mcp",
    version: "1.1.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// =============================================================================
// TOOLS - Actions Claude can take
// =============================================================================

const TOOLS = [
    ...moleToolsBeforeSearch,
    {
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
    },
    compareMolesTool,
    // ==========================================================================
    // ONTOLOGY TOOLS - Medical terminology and classification
    // ==========================================================================
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
            description: "Array of risk factor IDs (e.g., ['FAIR_SKIN', 'FAMILY_HISTORY', 'UV_EXPOSURE'])",
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

// Tool cost mapping for rate limiting
const TOOL_COSTS: Record<string, number> = {
  ...moleToolCosts,
  classify_lesion_features: 3,
  assess_risk_from_factors: 2,
  // Medium-cost tools (ontology lookups)
  lookup_medical_concept: 1,
  search_medical_concepts: 1,
  get_condition_progression: 1,
  map_snomed_to_icd10: 1,
  get_condition_risk_factors: 1,
  get_malignant_conditions: 1,
  // Low-cost tools (local knowledge base)
  search_medical_info: 1,
};

async function dispatch(
  name: string,
  args: Record<string, any>,
  ctx: ToolContext
) {
  const { userId, timer } = ctx;

  const moleResult = await dispatchMoleTool(apiClient, name, args);
  if (moleResult) return moleResult;

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

      // ========================================================================
      // ONTOLOGY TOOL HANDLERS
      // ========================================================================

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
        throw new Error(`Unknown tool: ${name}`);
    }
}

registerTools(server, TOOLS, TOOL_COSTS, dispatch);

// =============================================================================
// RESOURCES - Static content Claude can read
// =============================================================================

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: "molecare://knowledge/abcde-criteria",
      name: "ABCDE Criteria for Melanoma",
      description: "The ABCDE rule for identifying potentially cancerous moles",
      mimeType: "application/json",
    },
    {
      uri: "molecare://knowledge/skin-types",
      name: "Fitzpatrick Skin Types",
      description: "Classification of skin types and associated risks",
      mimeType: "application/json",
    },
    {
      uri: "molecare://knowledge/prevention-tips",
      name: "Skin Cancer Prevention",
      description: "Tips for preventing skin cancer and protecting skin",
      mimeType: "application/json",
    },
    {
      uri: "molecare://knowledge/when-to-see-doctor",
      name: "When to See a Dermatologist",
      description: "Guidelines for when to seek professional medical advice",
      mimeType: "application/json",
    },
    // Ontology Resources
    {
      uri: "molecare://ontology/snomed-codes",
      name: "SNOMED CT Codes Reference",
      description: "Reference guide for dermatology SNOMED CT codes used in the app",
      mimeType: "application/json",
    },
    {
      uri: "molecare://ontology/icd10-codes",
      name: "ICD-10 Codes Reference",
      description: "Reference guide for skin condition ICD-10 diagnosis codes",
      mimeType: "application/json",
    },
    {
      uri: "molecare://ontology/risk-factors",
      name: "Risk Factors Guide",
      description: "Complete guide to skin cancer risk factors and their relative risks",
      mimeType: "application/json",
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  // Ontology resources come from the backend (or its mock)
  if (uri.startsWith("molecare://ontology/")) {
    const ontologyContent = await getOntologyResource(uri);
    if (ontologyContent) {
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(ontologyContent, null, 2),
          },
        ],
      };
    }
  }

  // Everything else is local knowledge-base content
  const content = medicalKB.getResource(uri);

  if (!content) {
    throw new Error(`Resource not found: ${uri}`);
  }

  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(content, null, 2),
      },
    ],
  };
});



// Ontology resource handler
async function getOntologyResource(uri: string): Promise<any | null> {
  switch (uri) {
    case "molecare://ontology/snomed-codes":
      return {
        title: "SNOMED CT Dermatology Codes",
        description: "Clinical terminology codes for skin conditions",
        provenance: TERMINOLOGY_PROVENANCE.snomedCt,
        disclaimer:
          "This information is for educational purposes only and does not constitute medical advice.",
        codes: [
          {
            code: "372244006",
            name: "Malignant melanoma of skin",
            category: "MALIGNANT",
            description: "The most serious type of skin cancer",
          },
          {
            code: "21119008",
            name: "Pigmented nevus",
            category: "BENIGN",
            description: "A benign growth of melanocytes (common mole)",
          },
          {
            code: "254701007",
            name: "Dysplastic nevus",
            category: "PRECANCEROUS",
            description: "Atypical mole with some concerning features",
          },
          {
            code: "109264001",
            name: "Melanoma in situ",
            category: "PRECANCEROUS",
            description: "Early melanoma confined to the epidermis",
          },
          {
            code: "254651007",
            name: "Basal cell carcinoma",
            category: "MALIGNANT",
            description: "Most common type of skin cancer",
          },
          {
            code: "254652000",
            name: "Squamous cell carcinoma",
            category: "MALIGNANT",
            description: "Second most common type of skin cancer",
          },
          {
            code: "92564006",
            name: "Actinic keratosis",
            category: "PRECANCEROUS",
            description: "Pre-cancerous scaly patch from sun damage",
          },
        ],
      };

    case "molecare://ontology/icd10-codes":
      return {
        title: "ICD-10 Skin Condition Codes",
        description: "International Classification of Diseases codes for skin diagnoses",
        provenance: TERMINOLOGY_PROVENANCE.icd10,
        disclaimer:
          "This information is for educational purposes only and does not constitute medical advice.",
        codes: [
          {
            code: "C43",
            name: "Malignant melanoma of skin",
            chapter: "Chapter II - Neoplasms",
            category: "Malignant",
          },
          {
            code: "C44",
            name: "Other malignant neoplasms of skin",
            chapter: "Chapter II - Neoplasms",
            category: "Malignant",
          },
          {
            code: "D03",
            name: "Melanoma in situ",
            chapter: "Chapter II - Neoplasms",
            category: "In situ",
          },
          {
            code: "D22",
            name: "Melanocytic naevi",
            chapter: "Chapter II - Neoplasms",
            category: "Benign",
          },
          {
            code: "D23",
            name: "Other benign neoplasms of skin",
            chapter: "Chapter II - Neoplasms",
            category: "Benign",
          },
          {
            code: "L57.0",
            name: "Actinic keratosis",
            chapter: "Chapter XII - Diseases of skin",
            category: "Precancerous",
          },
        ],
      };

    case "molecare://ontology/risk-factors":
      return {
        title: "Skin Cancer Risk Factors",
        description: "Factors that increase the risk of developing skin cancer",
        disclaimer:
          "This information is for educational purposes only. Having risk factors does not mean you will develop skin cancer.",
        riskFactors: [
          {
            id: "FAIR_SKIN",
            name: "Fair skin (Fitzpatrick Type I-II)",
            category: "Genetic",
            relativeRisk: 2.5,
            description:
              "People with fair skin that burns easily have higher risk",
          },
          {
            id: "FAMILY_HISTORY",
            name: "Family history of melanoma",
            category: "Genetic",
            relativeRisk: 3.0,
            description:
              "Having a first-degree relative with melanoma increases risk",
          },
          {
            id: "MANY_MOLES",
            name: "Many moles (50+)",
            category: "Phenotypic",
            relativeRisk: 2.0,
            description:
              "Having more than 50 common moles increases melanoma risk",
          },
          {
            id: "ATYPICAL_MOLES",
            name: "Atypical moles",
            category: "Phenotypic",
            relativeRisk: 5.0,
            description: "Presence of dysplastic nevi significantly increases risk",
          },
          {
            id: "UV_EXPOSURE",
            name: "Excessive UV exposure",
            category: "Environmental",
            relativeRisk: 2.0,
            description:
              "History of sunburns or frequent tanning bed use",
          },
          {
            id: "PERSONAL_HISTORY",
            name: "Personal history of skin cancer",
            category: "Medical",
            relativeRisk: 9.0,
            description:
              "Previous skin cancer significantly increases risk of another",
          },
        ],
        recommendations: [
          "Use SPF 30+ sunscreen daily",
          "Perform monthly skin self-examinations",
          "Schedule annual dermatologist visits if you have risk factors",
          "Avoid tanning beds",
          "Seek shade during peak UV hours (10am-4pm)",
        ],
      };

    default:
      return null;
  }
}

// =============================================================================
// START SERVER
// =============================================================================

startServer(server, "MoleCare MCP Server").catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
