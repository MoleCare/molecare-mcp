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
import { MedicalKnowledgeBase } from "./resources/medical-kb.js";
import {
  dispatchKnowledgeTool,
  knowledgeToolCosts,
  ontologyTools,
  searchMedicalInfoTool,
} from "./tools/knowledge.js";
import {
  compareMolesTool,
  dispatchMoleTool,
  moleToolCosts,
  moleToolsBeforeSearch,
} from "./tools/moles.js";
import { TERMINOLOGY_PROVENANCE } from "./resources/terminology-provenance.js";
import {
  ICD10_CATEGORIES,
  SNOMED_CONCEPTS,
  SNOMED_TO_ICD10,
  findIcd10,
  terminologyCoverage,
} from "./resources/terminology-data.js";

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
  searchMedicalInfoTool,
  compareMolesTool,
  ...ontologyTools,
];

const TOOL_COSTS: Record<string, number> = {
  ...moleToolCosts,
  ...knowledgeToolCosts,
};

async function dispatch(
  name: string,
  args: Record<string, any>,
  ctx: ToolContext
) {
  const { userId, timer } = ctx;

  const moleResult = await dispatchMoleTool(apiClient, name, args);
  if (moleResult) return moleResult;

  const knowledgeResult = await dispatchKnowledgeTool(
    ontologyClient,
    medicalKB,
    name,
    args
  );
  if (knowledgeResult) return knowledgeResult;

  throw new Error(`Unknown tool: ${name}`);
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
      uri: "molecare://ontology/snomed-icd10-map",
      name: "SNOMED CT to ICD-10 Map",
      description:
        "Every bundled SNOMED CT to ICD-10 mapping, with the rationale and exactness for each row",
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
        description:
          "Clinical terminology codes for skin conditions. Every code listed here " +
          "resolves through lookup_medical_concept and maps to ICD-10 through " +
          "map_snomed_to_icd10.",
        provenance: TERMINOLOGY_PROVENANCE.snomedCt,
        disclaimer:
          "This information is for educational purposes only and does not constitute medical advice.",
        count: SNOMED_CONCEPTS.length,
        codes: SNOMED_CONCEPTS.map((concept) => ({
          code: concept.snomedCode,
          name: concept.name,
          category: concept.category,
          description: concept.description,
          icd10Codes: (SNOMED_TO_ICD10[concept.snomedCode] ?? []).map(
            (row) => row.icd10Code
          ),
        })),
      };

    case "molecare://ontology/icd10-codes":
      return {
        title: "ICD-10 Skin Condition Codes",
        description:
          "WHO ICD-10 categories for dermatology diagnoses, across neoplasms " +
          "(Chapter II) and diseases of the skin (Chapter XII).",
        provenance: TERMINOLOGY_PROVENANCE.icd10,
        disclaimer:
          "This information is for educational purposes only and does not constitute medical advice.",
        count: ICD10_CATEGORIES.length,
        codes: ICD10_CATEGORIES.map((entry) => ({
          code: entry.code,
          name: entry.name,
          chapter: entry.chapter,
          category: entry.group,
          ...(entry.note ? { note: entry.note } : {}),
        })),
      };

    case "molecare://ontology/snomed-icd10-map":
      return {
        title: "SNOMED CT to ICD-10 Map",
        description:
          "The complete bundled mapping table. Mappings are educational " +
          "category-level approximations, and a concept may have more than one " +
          "plausible ICD-10 target.",
        provenance: TERMINOLOGY_PROVENANCE,
        disclaimer:
          "This information is for educational purposes only and does not constitute medical advice.",
        coverage: terminologyCoverage(),
        mappings: SNOMED_CONCEPTS.map((concept) => ({
          snomedCode: concept.snomedCode,
          snomedName: concept.name,
          icd10: (SNOMED_TO_ICD10[concept.snomedCode] ?? []).map((row) => {
            const category = findIcd10(row.icd10Code);
            return {
              code: row.icd10Code,
              name: category?.name ?? row.icd10Code,
              chapter: category?.chapter,
              mappingExactness: row.exactness,
              rationale: row.rationale,
            };
          }),
        })),
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
