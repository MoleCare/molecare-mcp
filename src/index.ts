#!/usr/bin/env node

/**
 * MoleCare MCP Server
 * ====================
 *
 * Provides Claude with access to MoleCare data for AI features:
 * - Mole analysis results
 * - User health profiles
 * - Change detection history
 * - Medical knowledge base
 *
 * Usage:
 *   npm run build
 *   npm start
 *
 * Or for development:
 *   npm run dev
 */

import { createServer } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { MoleCareApiClient } from "./api/molecare-client.js";
import { OntologyApiClient } from "./api/ontology-client.js";
import { MedicalKnowledgeBase } from "./resources/medical-kb.js";
import { rateLimitService } from "./services/RateLimitService.js";

// DevOps & MLOps clients
import { MLflowApiClient } from "./api/mlflow-client.js";
import { InfrastructureClient } from "./api/infrastructure-client.js";
import { CICDClient } from "./api/cicd-client.js";
import { FeastClient } from "./api/feast-client.js";
import { EC2Client } from "./api/ec2-client.js";
import { AppClient } from "./api/app-client.js";
import { DatabaseClient } from "./api/database-client.js";

// Utilities
import { cache, CACHE_TTL } from "./utils/cache.js";
import { validateInput, TOOL_SCHEMAS } from "./utils/validation.js";
import { logger, createTimer } from "./utils/logger.js";
import { performHealthCheck, formatUptime } from "./utils/health.js";

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

// Initialize DevOps & MLOps clients
const mlflowClient = new MLflowApiClient({
  baseUrl: process.env.MLFLOW_TRACKING_URI || "http://localhost:5000",
  apiKey: process.env.MLFLOW_API_KEY,
});

const infraClient = new InfrastructureClient({
  webAppUrl: process.env.WEB_APP_URL,
  mobileApiUrl: process.env.MOBILE_API_URL,
  backendUrl: process.env.BACKEND_URL || "http://localhost:8080",
});

const cicdClient = new CICDClient({
  githubToken: process.env.GITHUB_TOKEN,
  githubOwner: process.env.GITHUB_OWNER || "molecare",
  githubRepo: process.env.GITHUB_REPO || "molecare-ml",
});

const feastClient = new FeastClient({
  baseUrl: process.env.FEAST_SERVER_URL || "http://localhost:6566",
  projectName: process.env.FEAST_PROJECT || "molecare",
});

const ec2Client = new EC2Client({
  region: process.env.AWS_REGION || "us-east-1",
  instanceIds: process.env.EC2_INSTANCE_IDS?.split(","),
});

const appClient = new AppClient({
  webAppUrl: process.env.WEB_APP_URL || "http://localhost:3000",
  mobileApiUrl: process.env.MOBILE_API_URL || "http://localhost:8080/api",
});

const dbClient = new DatabaseClient({
  primaryHost: process.env.DB_HOST || "localhost",
  primaryPort: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME || "molecare",
  redisHost: process.env.REDIS_HOST || "localhost:6379",
});

// Create MCP server
const server = new Server(
  {
    name: "molecare-mcp",
    version: "1.0.0",
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

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_user_moles",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Get all moles for a user with their current risk levels and last analysis dates. Use this to understand a user's overall skin health status.",
      inputSchema: {
        type: "object" as const,
        properties: {
          userId: {
            type: "string",
            description: "The user's unique identifier",
          },
        },
        required: ["userId"],
      },
    },
    {
      name: "get_mole_analysis",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Get detailed ML analysis results for a specific mole including ABCDE scores (Asymmetry, Border, Color, Diameter, Evolution). Use this to explain analysis results to users.",
      inputSchema: {
        type: "object" as const,
        properties: {
          moleId: {
            type: "string",
            description: "The mole's unique identifier",
          },
        },
        required: ["moleId"],
      },
    },
    {
      name: "get_mole_changes",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Get the change history for a mole over time, including size changes, color changes, and trend analysis. Use this to explain how a mole has evolved.",
      inputSchema: {
        type: "object" as const,
        properties: {
          moleId: {
            type: "string",
            description: "The mole's unique identifier",
          },
        },
        required: ["moleId"],
      },
    },
    {
      name: "get_user_risk_factors",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Get a user's skin cancer risk factors including skin type, family history, sun exposure habits, and calculated risk level. Use this for personalized advice.",
      inputSchema: {
        type: "object" as const,
        properties: {
          userId: {
            type: "string",
            description: "The user's unique identifier",
          },
        },
        required: ["userId"],
      },
    },
    {
      name: "search_medical_info",
      annotations: { readOnlyHint: true },
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
    {
      name: "compare_moles",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Compare two mole images to identify changes. Use this when a user asks about changes between photos.",
      inputSchema: {
        type: "object" as const,
        properties: {
          moleId: {
            type: "string",
            description: "The mole's unique identifier",
          },
          imageId1: {
            type: "string",
            description: "First image ID (older)",
          },
          imageId2: {
            type: "string",
            description: "Second image ID (newer)",
          },
        },
        required: ["moleId", "imageId1", "imageId2"],
      },
    },
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
        "Calculate risk assessment based on a list of risk factors. Returns combined relative risk and recommendations.",
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
        "Classify a lesion based on its ABCDE features. Returns possible conditions, risk level, and recommendations. Use this to help interpret mole analysis results.",
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
    // ==========================================================================
    // DEVOPS & INFRASTRUCTURE TOOLS
    // ==========================================================================
    {
      name: "get_app_status",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Get status of all MoleCare applications including web app, mobile API, backend, and ML serving. Use this to check overall system health.",
      inputSchema: {
        type: "object" as const,
        properties: {
          appType: {
            type: "string",
            enum: ["web", "mobile", "backend", "ml-serving", "all"],
            description: "Type of application to check (default: all)",
          },
        },
        required: [],
      },
    },
    {
      name: "get_kubernetes_status",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Get Kubernetes cluster status including nodes, namespaces, deployments, and pod health.",
      inputSchema: {
        type: "object" as const,
        properties: {
          namespace: {
            type: "string",
            description: "Optional namespace to filter (e.g., 'molecare', 'ml-serving', 'mlops')",
          },
        },
        required: [],
      },
    },
    {
      name: "get_deployments",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Get status of Kubernetes deployments across namespaces. Shows replica counts, images, and health status.",
      inputSchema: {
        type: "object" as const,
        properties: {
          namespace: {
            type: "string",
            description: "Namespace to filter deployments",
          },
        },
        required: [],
      },
    },
    {
      name: "get_service_health",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Get health status of all backend services including databases, cache, storage, auth, and external dependencies.",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    {
      name: "get_database_status",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Get status of all databases including PostgreSQL and Redis instances with connection pools and latency.",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    // ==========================================================================
    // CI/CD & PIPELINE TOOLS
    // ==========================================================================
    {
      name: "get_pipeline_runs",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Get recent CI/CD pipeline runs from GitHub Actions. Shows build status, duration, and triggered by.",
      inputSchema: {
        type: "object" as const,
        properties: {
          workflow: {
            type: "string",
            description: "Optional workflow name to filter",
          },
          limit: {
            type: "number",
            description: "Number of runs to return (default: 10)",
          },
        },
        required: [],
      },
    },
    {
      name: "get_pipeline_summary",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Get summary statistics for CI/CD pipelines including success rate, average duration, and failure count.",
      inputSchema: {
        type: "object" as const,
        properties: {
          days: {
            type: "number",
            description: "Number of days to analyze (default: 7)",
          },
        },
        required: [],
      },
    },
    {
      name: "get_training_runs",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Get Metaflow ML training pipeline runs. Shows training status, parameters, and duration.",
      inputSchema: {
        type: "object" as const,
        properties: {
          flowName: {
            type: "string",
            description: "Flow name to filter (e.g., 'MelanomaTrainingFlow')",
          },
          limit: {
            type: "number",
            description: "Number of runs to return (default: 10)",
          },
        },
        required: [],
      },
    },
    {
      name: "get_deployment_status",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Get current deployment status for staging and production environments.",
      inputSchema: {
        type: "object" as const,
        properties: {
          environment: {
            type: "string",
            enum: ["staging", "production"],
            description: "Environment to check",
          },
        },
        required: [],
      },
    },
    {
      name: "get_releases",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Get recent releases with version info, release notes, and assets.",
      inputSchema: {
        type: "object" as const,
        properties: {
          limit: {
            type: "number",
            description: "Number of releases to return (default: 10)",
          },
        },
        required: [],
      },
    },
    // ==========================================================================
    // MLFLOW & MODEL REGISTRY TOOLS
    // ==========================================================================
    {
      name: "get_mlflow_experiments",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "List all MLflow experiments with their status and last update time.",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    {
      name: "get_mlflow_runs",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Get MLflow runs for an experiment with metrics, parameters, and status.",
      inputSchema: {
        type: "object" as const,
        properties: {
          experimentId: {
            type: "string",
            description: "Experiment ID to query",
          },
          filter: {
            type: "string",
            description: "Optional filter string (e.g., 'metrics.auc > 0.9')",
          },
          limit: {
            type: "number",
            description: "Number of runs to return (default: 10)",
          },
        },
        required: ["experimentId"],
      },
    },
    {
      name: "get_registered_models",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "List all registered ML models in MLflow model registry with versions and stages.",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    {
      name: "get_model_version",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Get details of a specific model version including stage, metrics, and run info.",
      inputSchema: {
        type: "object" as const,
        properties: {
          modelName: {
            type: "string",
            description: "Name of the registered model",
          },
          version: {
            type: "string",
            description: "Version number to query",
          },
        },
        required: ["modelName", "version"],
      },
    },
    {
      name: "compare_model_runs",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Compare metrics between multiple MLflow runs to evaluate model performance.",
      inputSchema: {
        type: "object" as const,
        properties: {
          runIds: {
            type: "array",
            items: { type: "string" },
            description: "Array of run IDs to compare",
          },
        },
        required: ["runIds"],
      },
    },
    // ==========================================================================
    // FEAST FEATURE STORE TOOLS
    // ==========================================================================
    {
      name: "get_feature_views",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "List all Feast feature views with their entities, features, and data sources.",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    {
      name: "get_feature_view_details",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Get detailed information about a specific feature view.",
      inputSchema: {
        type: "object" as const,
        properties: {
          name: {
            type: "string",
            description: "Name of the feature view",
          },
        },
        required: ["name"],
      },
    },
    {
      name: "get_feature_freshness",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Get freshness status of all feature views showing last materialization time and staleness.",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    {
      name: "get_online_features",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Retrieve online features for an entity from Feast feature store.",
      inputSchema: {
        type: "object" as const,
        properties: {
          featureView: {
            type: "string",
            description: "Name of the feature view",
          },
          entityKey: {
            type: "object",
            description: "Entity key as JSON object (e.g., {user_id: '123'})",
          },
        },
        required: ["featureView", "entityKey"],
      },
    },
    {
      name: "get_feature_store_stats",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Get overall statistics about the Feast feature store including counts and store types.",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    // ==========================================================================
    // SYSTEM TOOLS
    // ==========================================================================
    {
      name: "get_system_health",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Get comprehensive health status of all MCP backend services. Use this to check if services are available before making other calls.",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    {
      name: "clear_cache",
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
      description:
        "Clear the MCP server's internal cache. Use when you need fresh data after known changes.",
      inputSchema: {
        type: "object" as const,
        properties: {
          pattern: {
            type: "string",
            description: "Optional regex pattern to clear specific cache keys (e.g., 'mlflow:.*')",
          },
        },
        required: [],
      },
    },
    // ==========================================================================
    // EC2 TOOLS
    // ==========================================================================
    {
      name: "get_ec2_instances",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Get all MoleCare EC2 instances with their current state, IP addresses, and instance types. Use this to see all running servers.",
      inputSchema: {
        type: "object" as const,
        properties: {
          environment: {
            type: "string",
            enum: ["production", "staging", "all"],
            description: "Filter by environment (default: all)",
          },
        },
        required: [],
      },
    },
    {
      name: "get_ec2_instance",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Get detailed information about a specific EC2 instance by its instance ID.",
      inputSchema: {
        type: "object" as const,
        properties: {
          instanceId: {
            type: "string",
            description: "The EC2 instance ID (e.g., i-0abc123def456789a)",
          },
        },
        required: ["instanceId"],
      },
    },
    {
      name: "get_ec2_health",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Get AWS health check status for EC2 instances including instance and system status checks.",
      inputSchema: {
        type: "object" as const,
        properties: {
          instanceId: {
            type: "string",
            description: "Optional instance ID to check specific instance (default: all MoleCare instances)",
          },
        },
        required: [],
      },
    },
    {
      name: "get_ec2_metrics",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Get CloudWatch metrics (CPU, network) for an EC2 instance over a specified time period.",
      inputSchema: {
        type: "object" as const,
        properties: {
          instanceId: {
            type: "string",
            description: "The EC2 instance ID",
          },
          periodMinutes: {
            type: "number",
            description: "Time period in minutes to fetch metrics for (default: 60, max: 1440)",
          },
        },
        required: ["instanceId"],
      },
    },
    {
      name: "check_server_health",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Check if the molecare-server application is responding on an EC2 instance by hitting its health endpoint.",
      inputSchema: {
        type: "object" as const,
        properties: {
          instanceId: {
            type: "string",
            description: "The EC2 instance ID running molecare-server",
          },
        },
        required: ["instanceId"],
      },
    },
    // ==========================================================================
    // APP MONITORING TOOLS
    // ==========================================================================
    {
      name: "get_web_app_status",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Get the current status of the MoleCare web application including health, version, response time, and uptime.",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    {
      name: "get_mobile_api_status",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Get the current status of the MoleCare mobile API backend including health, version, and response time.",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    {
      name: "get_all_apps_status",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Get status of all MoleCare applications (web, mobile API, iOS app, Android app) in one call.",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    {
      name: "get_app_metrics",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Get application metrics including request counts, error rates, response times, and active users.",
      inputSchema: {
        type: "object" as const,
        properties: {
          app: {
            type: "string",
            enum: ["web", "mobile", "api"],
            description: "Which app to get metrics for",
          },
          periodHours: {
            type: "number",
            description: "Time period in hours (default: 24, max: 168)",
          },
        },
        required: ["app"],
      },
    },
    {
      name: "get_app_errors",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Get recent application errors including error messages, endpoints, status codes, and occurrence counts.",
      inputSchema: {
        type: "object" as const,
        properties: {
          app: {
            type: "string",
            enum: ["web", "mobile", "api", "all"],
            description: "Which app to get errors for (default: all)",
          },
          limit: {
            type: "number",
            description: "Maximum number of errors to return (default: 10)",
          },
        },
        required: [],
      },
    },
    {
      name: "get_app_versions",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Get deployed versions of all MoleCare applications across environments (production, staging).",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    {
      name: "get_app_store_status",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Get iOS App Store and Android Play Store status including ratings, reviews, and current live versions.",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    // ==========================================================================
    // DATABASE TOOLS (extended)
    // ==========================================================================
    {
      name: "get_database_metrics",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Get database performance metrics including query stats, storage usage, cache hit ratios, and deadlocks.",
      inputSchema: {
        type: "object" as const,
        properties: {
          periodHours: {
            type: "number",
            description: "Time period in hours (default: 24, max: 168)",
          },
        },
        required: [],
      },
    },
    {
      name: "get_slow_queries",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Get slow database queries that may need optimization, sorted by total execution time.",
      inputSchema: {
        type: "object" as const,
        properties: {
          limit: {
            type: "number",
            description: "Maximum number of queries to return (default: 10)",
          },
          minDurationMs: {
            type: "number",
            description: "Minimum query duration in ms to include (default: 1000)",
          },
        },
        required: [],
      },
    },
    {
      name: "get_table_stats",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Get statistics for database tables including row counts, sizes, and vacuum/analyze status.",
      inputSchema: {
        type: "object" as const,
        properties: {
          schema: {
            type: "string",
            description: "Database schema to query (default: public)",
          },
        },
        required: [],
      },
    },
    {
      name: "get_backup_history",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Get database backup history including automated and manual backups with their status and sizes.",
      inputSchema: {
        type: "object" as const,
        properties: {
          limit: {
            type: "number",
            description: "Maximum number of backups to return (default: 10)",
          },
        },
        required: [],
      },
    },
    {
      name: "get_connection_pools",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Get connection pool status for all database clients showing active, idle, and waiting connections.",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
  ],
}));

// Tool cost mapping for rate limiting
const TOOL_COSTS: Record<string, number> = {
  // High-cost tools (API calls, complex operations)
  get_user_moles: 2,
  get_mole_analysis: 3,
  get_mole_changes: 2,
  get_user_risk_factors: 2,
  compare_moles: 5,
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
  // DevOps & Infrastructure tools
  get_app_status: 2,
  get_kubernetes_status: 2,
  get_deployments: 1,
  get_service_health: 2,
  get_database_status: 1,
  // CI/CD & Pipeline tools
  get_pipeline_runs: 2,
  get_pipeline_summary: 2,
  get_training_runs: 2,
  get_deployment_status: 1,
  get_releases: 1,
  // MLflow tools
  get_mlflow_experiments: 1,
  get_mlflow_runs: 2,
  get_registered_models: 1,
  get_model_version: 1,
  compare_model_runs: 3,
  // Feast Feature Store tools
  get_feature_views: 1,
  get_feature_view_details: 1,
  get_feature_freshness: 1,
  get_online_features: 2,
  get_feature_store_stats: 1,
  // System tools
  get_system_health: 1,
  clear_cache: 1,
  // EC2 tools
  get_ec2_instances: 2,
  get_ec2_instance: 1,
  get_ec2_health: 2,
  get_ec2_metrics: 3,
  check_server_health: 2,
  // App Monitoring tools
  get_web_app_status: 2,
  get_mobile_api_status: 2,
  get_all_apps_status: 3,
  get_app_metrics: 2,
  get_app_errors: 2,
  get_app_versions: 1,
  get_app_store_status: 2,
  // Database tools (extended)
  get_database_metrics: 2,
  get_slow_queries: 2,
  get_table_stats: 2,
  get_backup_history: 1,
  get_connection_pools: 1,
};

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  const timer = createTimer();

  // Extract user ID from request context or arguments
  const userId = (args?.userId as string) || "anonymous";

  // Validate input if schema exists
  const schema = TOOL_SCHEMAS[name];
  if (schema) {
    const validation = validateInput(schema, args);
    if (!validation.success) {
      logger.warn(`Validation failed for ${name}`, { error: validation.error });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: true,
              code: "VALIDATION_ERROR",
              message: validation.error,
              tool: name,
            }),
          },
        ],
        isError: true,
      };
    }
  }

  // Get tool cost (default to 1)
  const toolCost = TOOL_COSTS[name] || 1;

  // Check rate limit before executing tool
  const rateLimitResult = rateLimitService.tryConsume(userId, toolCost);

  if (!rateLimitResult.allowed) {
    logger.warn(`Rate limit exceeded for ${userId}`, { tool: name });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: true,
            code: "RATE_LIMIT_EXCEEDED",
            message: `Rate limit exceeded. You have ${rateLimitResult.remainingTokens} tokens remaining. Please try again in ${Math.ceil((rateLimitResult.retryAfterMs || 60000) / 1000)} seconds.`,
            retryAfterMs: rateLimitResult.retryAfterMs,
            remainingTokens: rateLimitResult.remainingTokens,
            resetTime: new Date(rateLimitResult.resetTime).toISOString(),
          }),
        },
      ],
      isError: true,
    };
  }

  try {
    switch (name) {
      case "get_user_moles": {
        const moles = await apiClient.getUserMoles(args.userId as string);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  userId: args.userId,
                  totalMoles: moles.length,
                  moles: moles.map((m: any) => ({
                    id: m.id,
                    bodyPart: m.bodyPart,
                    nickname: m.nickname,
                    createdAt: m.createdAt,
                    lastAnalyzedAt: m.lastAnalyzedAt,
                    riskLevel: m.riskLevel,
                    imageCount: m.images?.length || 0,
                  })),
                  summary: {
                    highRisk: moles.filter((m: any) => m.riskLevel === "HIGH").length,
                    moderateRisk: moles.filter((m: any) => m.riskLevel === "MODERATE").length,
                    lowRisk: moles.filter((m: any) => m.riskLevel === "LOW").length,
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_mole_analysis": {
        const analysis = await apiClient.getMoleAnalysis(args.moleId as string);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  moleId: args.moleId,
                  analysisDate: analysis.date,
                  overallScore: analysis.score,
                  riskLevel: analysis.riskLevel,
                  confidence: analysis.confidence,
                  abcdeScores: {
                    asymmetry: {
                      score: analysis.asymmetryScore,
                      description: getAsymmetryDescription(analysis.asymmetryScore),
                    },
                    border: {
                      score: analysis.borderScore,
                      description: getBorderDescription(analysis.borderScore),
                    },
                    color: {
                      score: analysis.colorScore,
                      variations: analysis.colorVariations,
                      description: getColorDescription(analysis.colorScore),
                    },
                    diameter: {
                      mm: analysis.diameterMm,
                      description: getDiameterDescription(analysis.diameterMm),
                    },
                    evolution: {
                      score: analysis.evolutionScore,
                      description: getEvolutionDescription(analysis.evolutionScore),
                    },
                  },
                  recommendation: getRecommendation(analysis.riskLevel),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_mole_changes": {
        const history = await apiClient.getMoleHistory(args.moleId as string);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  moleId: args.moleId,
                  trackingStarted: history.startDate,
                  totalImages: history.imageCount,
                  changes: history.changes,
                  trend: history.trend,
                  trendDescription: getTrendDescription(history.trend),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_user_risk_factors": {
        const profile = await apiClient.getUserProfile(args.userId as string);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  userId: args.userId,
                  skinType: profile.skinType,
                  riskFactors: profile.riskFactors,
                  overallRiskLevel: profile.riskLevel,
                  recommendations: getPersonalizedRecommendations(profile),
                },
                null,
                2
              ),
            },
          ],
        };
      }

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

      case "compare_moles": {
        const comparison = await apiClient.compareMoleImages(
          args.moleId as string,
          args.imageId1 as string,
          args.imageId2 as string
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  moleId: args.moleId,
                  comparison: {
                    sizeChange: comparison.sizeChangePercent,
                    colorChange: comparison.colorChange,
                    borderChange: comparison.borderChange,
                    overallChange: comparison.overallChange,
                  },
                  significance: comparison.significance,
                  recommendation: comparison.recommendation,
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
        const assessments = await ontologyClient.assessRisk(
          args.riskFactorIds as string[]
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  inputFactors: args.riskFactorIds,
                  assessments,
                  disclaimer:
                    "This risk assessment is for educational purposes only. Please consult a healthcare professional for personalized medical advice.",
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
                  disclaimer:
                    "This classification is for educational purposes only and is NOT a medical diagnosis. Please consult a dermatologist for any skin concerns.",
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

      // ========================================================================
      // DEVOPS & INFRASTRUCTURE TOOL HANDLERS
      // ========================================================================

      case "get_app_status": {
        const appType = (args.appType as string) || "all";
        let statuses;

        if (appType === "all") {
          statuses = await infraClient.getAllApplicationStatus();
        } else if (appType === "web") {
          statuses = [await infraClient.getWebAppStatus()];
        } else if (appType === "mobile") {
          statuses = [await infraClient.getMobileAppStatus()];
        } else if (appType === "backend") {
          statuses = [await infraClient.getBackendStatus()];
        } else if (appType === "ml-serving") {
          statuses = [await infraClient.getMLServingStatus()];
        } else {
          statuses = await infraClient.getAllApplicationStatus();
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  applications: statuses,
                  summary: {
                    total: statuses.length,
                    healthy: statuses.filter((s) => s.status === "healthy").length,
                    degraded: statuses.filter((s) => s.status === "degraded").length,
                    unhealthy: statuses.filter((s) => s.status === "unhealthy").length,
                  },
                  checkedAt: new Date().toISOString(),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_kubernetes_status": {
        const k8sStatus = await infraClient.getKubernetesStatus();
        const namespace = args.namespace as string | undefined;

        let filteredNamespaces = k8sStatus.namespaces;
        if (namespace) {
          filteredNamespaces = k8sStatus.namespaces.filter(
            (ns) => ns.name === namespace
          );
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  cluster: k8sStatus.cluster,
                  status: k8sStatus.status,
                  nodes: k8sStatus.nodes,
                  namespaces: filteredNamespaces,
                  summary: {
                    totalNodes: k8sStatus.nodes.length,
                    readyNodes: k8sStatus.nodes.filter((n) => n.status === "Ready").length,
                    totalPods: filteredNamespaces.reduce((sum, ns) => sum + ns.pods.total, 0),
                    runningPods: filteredNamespaces.reduce((sum, ns) => sum + ns.pods.running, 0),
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_deployments": {
        const namespace = args.namespace as string | undefined;
        const deployments = await infraClient.getDeployments(namespace);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  deployments,
                  summary: {
                    total: deployments.length,
                    healthy: deployments.filter((d) => d.status === "healthy").length,
                    degraded: deployments.filter((d) => d.status === "degraded").length,
                    unhealthy: deployments.filter((d) => d.status === "unhealthy").length,
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_service_health": {
        const services = await infraClient.getAllServiceHealth();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  services,
                  summary: {
                    total: services.length,
                    healthy: services.filter((s) => s.status === "healthy").length,
                    degraded: services.filter((s) => s.status === "degraded").length,
                    unhealthy: services.filter((s) => s.status === "unhealthy").length,
                  },
                  checkedAt: new Date().toISOString(),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_database_status": {
        const databases = await infraClient.getDatabaseStatus();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  databases,
                  summary: {
                    total: databases.length,
                    connected: databases.filter((d) => d.status === "connected").length,
                    slow: databases.filter((d) => d.status === "slow").length,
                    disconnected: databases.filter((d) => d.status === "disconnected").length,
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // ========================================================================
      // CI/CD & PIPELINE TOOL HANDLERS
      // ========================================================================

      case "get_pipeline_runs": {
        const workflow = args.workflow as string | undefined;
        const limit = (args.limit as number) || 10;
        const runs = await cicdClient.getWorkflowRuns(workflow, limit);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  runs: runs.map((r) => ({
                    id: r.id,
                    name: r.name,
                    status: r.status,
                    conclusion: r.conclusion,
                    branch: r.branch,
                    commit: r.commit,
                    commitMessage: r.commitMessage,
                    triggeredBy: r.triggeredBy,
                    startedAt: r.startedAt,
                    duration: r.duration,
                    url: r.url,
                  })),
                  count: runs.length,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_pipeline_summary": {
        const days = (args.days as number) || 7;
        const summary = await cicdClient.getPipelineSummary(days);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  period: `Last ${days} days`,
                  summary,
                  insight:
                    summary.successRate >= 90
                      ? "Pipeline health is excellent"
                      : summary.successRate >= 70
                      ? "Pipeline health is good, some failures to investigate"
                      : "Pipeline health needs attention - multiple failures detected",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_training_runs": {
        const flowName = args.flowName as string | undefined;
        const limit = (args.limit as number) || 10;
        const runs = await cicdClient.getMetaflowRuns(flowName, limit);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  runs,
                  summary: {
                    total: runs.length,
                    running: runs.filter((r) => r.status === "running").length,
                    completed: runs.filter((r) => r.status === "completed").length,
                    failed: runs.filter((r) => r.status === "failed").length,
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_deployment_status": {
        const environment = args.environment as "staging" | "production" | undefined;

        if (environment) {
          const deployments = await cicdClient.getDeployments(environment, 1);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    environment,
                    currentDeployment: deployments[0] || null,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        const status = await cicdClient.getCurrentDeploymentStatus();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(status, null, 2),
            },
          ],
        };
      }

      case "get_releases": {
        const limit = (args.limit as number) || 10;
        const releases = await cicdClient.getReleases(limit);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  releases,
                  latest: releases[0] || null,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // ========================================================================
      // MLFLOW & MODEL REGISTRY TOOL HANDLERS
      // ========================================================================

      case "get_mlflow_experiments": {
        // Cache experiments for 5 minutes (they don't change often)
        const experiments = await cache.getOrFetch(
          "mlflow:experiments",
          () => mlflowClient.listExperiments(),
          CACHE_TTL.LONG
        );

        logger.toolCall({
          tool: name,
          args: {},
          duration_ms: timer(),
          success: true,
          userId,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  experiments: experiments.map((e) => ({
                    id: e.experimentId,
                    name: e.name,
                    lifecycleStage: e.lifecycleStage,
                    lastUpdated: new Date(e.lastUpdateTime).toISOString(),
                    tags: e.tags,
                  })),
                  count: experiments.length,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_mlflow_runs": {
        const experimentId = args.experimentId as string;
        const filter = args.filter as string | undefined;
        const limit = (args.limit as number) || 10;

        const runs = await mlflowClient.searchRuns([experimentId], filter, limit);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  experimentId,
                  runs: runs.map((r) => ({
                    runId: r.runId,
                    status: r.status,
                    startTime: new Date(r.startTime).toISOString(),
                    endTime: r.endTime ? new Date(r.endTime).toISOString() : null,
                    metrics: Object.fromEntries(r.metrics.map((m) => [m.key, m.value])),
                    params: Object.fromEntries(r.params.map((p) => [p.key, p.value])),
                    tags: r.tags,
                  })),
                  count: runs.length,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_registered_models": {
        // Cache models for 5 minutes
        const models = await cache.getOrFetch(
          "mlflow:registered_models",
          () => mlflowClient.listRegisteredModels(),
          CACHE_TTL.LONG
        );

        logger.toolCall({
          tool: name,
          args: {},
          duration_ms: timer(),
          success: true,
          userId,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  models: models.map((m) => ({
                    name: m.name,
                    description: m.description,
                    latestVersions: m.latestVersions.map((v) => ({
                      version: v.version,
                      stage: v.currentStage,
                      status: v.status,
                      runId: v.runId,
                    })),
                    tags: m.tags,
                  })),
                  count: models.length,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_model_version": {
        const modelName = args.modelName as string;
        const version = args.version as string;

        const modelVersion = await mlflowClient.getModelVersion(modelName, version);

        if (!modelVersion) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: true,
                  message: `Model version ${modelName}:${version} not found`,
                }),
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  model: modelVersion,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "compare_model_runs": {
        const runIds = args.runIds as string[];
        const comparison = await mlflowClient.compareRuns(runIds);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  comparison: comparison.comparison,
                  runs: comparison.runs.map((r) => ({
                    runId: r.runId,
                    status: r.status,
                    params: Object.fromEntries(r.params.map((p) => [p.key, p.value])),
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // ========================================================================
      // FEAST FEATURE STORE TOOL HANDLERS
      // ========================================================================

      case "get_feature_views": {
        const featureViews = await feastClient.listFeatureViews();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  featureViews: featureViews.map((fv) => ({
                    name: fv.name,
                    description: fv.description,
                    entities: fv.entities,
                    featureCount: fv.features.length,
                    source: fv.source,
                    ttl: fv.ttl,
                    tags: fv.tags,
                  })),
                  count: featureViews.length,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_feature_view_details": {
        const name = args.name as string;
        const featureView = await feastClient.getFeatureView(name);

        if (!featureView) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: true,
                  message: `Feature view '${name}' not found`,
                }),
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  featureView,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_feature_freshness": {
        const freshness = await feastClient.getFeatureFreshness();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  freshness,
                  summary: {
                    total: freshness.length,
                    fresh: freshness.filter((f) => !f.isStale).length,
                    stale: freshness.filter((f) => f.isStale).length,
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_online_features": {
        const featureView = args.featureView as string;
        const entityKey = args.entityKey as Record<string, any>;

        const features = await feastClient.getOnlineFeatures(featureView, entityKey);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  featureView,
                  entityKey,
                  features: features.features,
                  metadata: features.metadata,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_feature_store_stats": {
        const stats = await feastClient.getStoreStats();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  stats,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // =============================================================================
      // System Tools
      // =============================================================================

      case "get_system_health": {
        const health = await performHealthCheck({
          mlflow: mlflowClient,
          infra: infraClient,
          cicd: cicdClient,
          feast: feastClient,
          api: apiClient,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: health.status,
                  uptime: formatUptime(health.uptime),
                  services: health.services,
                  summary: health.summary,
                  timestamp: new Date().toISOString(),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "clear_cache": {
        const pattern = args.pattern as string | undefined;
        const cacheStatsBefore = cache.stats();

        if (pattern) {
          cache.invalidatePattern(pattern);
        } else {
          cache.clear();
        }

        const cacheStatsAfter = cache.stats();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  pattern: pattern || "all",
                  cleared: cacheStatsBefore.size - cacheStatsAfter.size,
                  remaining: cacheStatsAfter.size,
                  message: pattern
                    ? `Cleared cache entries matching pattern: ${pattern}`
                    : "Cleared all cache entries",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // =============================================================================
      // EC2 Tools
      // =============================================================================

      case "get_ec2_instances": {
        const environment = args.environment as string | undefined;
        const instances = await ec2Client.getInstances();

        const filtered =
          environment && environment !== "all"
            ? instances.filter((i) => i.tags.environment === environment)
            : instances;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  instances: filtered,
                  summary: {
                    total: filtered.length,
                    running: filtered.filter((i) => i.state === "running").length,
                    stopped: filtered.filter((i) => i.state === "stopped").length,
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_ec2_instance": {
        const instanceId = args.instanceId as string;
        const instance = await ec2Client.getInstance(instanceId);

        if (!instance) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: true,
                  message: `Instance ${instanceId} not found`,
                }),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(instance, null, 2),
            },
          ],
        };
      }

      case "get_ec2_health": {
        const instanceId = args.instanceId as string | undefined;
        const healthChecks = await ec2Client.getInstanceHealth(instanceId);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  healthChecks,
                  summary: {
                    total: healthChecks.length,
                    healthy: healthChecks.filter(
                      (h) => h.instanceStatus === "ok" && h.systemStatus === "ok"
                    ).length,
                    issues: healthChecks.filter(
                      (h) => h.instanceStatus !== "ok" || h.systemStatus !== "ok"
                    ).length,
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_ec2_metrics": {
        const instanceId = args.instanceId as string;
        const periodMinutes = (args.periodMinutes as number) || 60;

        const metrics = await ec2Client.getInstanceMetrics(instanceId, periodMinutes);

        // Calculate averages for summary
        const avgCpu =
          metrics.cpuUtilization.length > 0
            ? metrics.cpuUtilization.reduce((sum, dp) => sum + dp.value, 0) /
              metrics.cpuUtilization.length
            : 0;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  instanceId: metrics.instanceId,
                  period: metrics.period,
                  summary: {
                    avgCpuUtilization: `${avgCpu.toFixed(1)}%`,
                    dataPoints: metrics.cpuUtilization.length,
                  },
                  metrics: {
                    cpuUtilization: metrics.cpuUtilization,
                    networkIn: metrics.networkIn,
                    networkOut: metrics.networkOut,
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "check_server_health": {
        const instanceId = args.instanceId as string;
        const health = await ec2Client.checkServerHealth(instanceId);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  instanceId: health.instanceId,
                  serverHealthy: health.httpHealthy,
                  responseTimeMs: health.responseTimeMs,
                  error: health.error,
                  checkedAt: new Date().toISOString(),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // =============================================================================
      // App Monitoring Tools
      // =============================================================================

      case "get_web_app_status": {
        const status = await appClient.getWebAppStatus();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(status, null, 2),
            },
          ],
        };
      }

      case "get_mobile_api_status": {
        const status = await appClient.getMobileApiStatus();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(status, null, 2),
            },
          ],
        };
      }

      case "get_all_apps_status": {
        const statuses = await appClient.getAllAppStatus();

        const summary = {
          total: statuses.length,
          healthy: statuses.filter((s) => s.status === "healthy").length,
          degraded: statuses.filter((s) => s.status === "degraded").length,
          down: statuses.filter((s) => s.status === "down").length,
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  apps: statuses,
                  summary,
                  checkedAt: new Date().toISOString(),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_app_metrics": {
        const app = args.app as "web" | "mobile" | "api";
        const periodHours = (args.periodHours as number) || 24;

        const metrics = await appClient.getAppMetrics(app, periodHours);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(metrics, null, 2),
            },
          ],
        };
      }

      case "get_app_errors": {
        const app = (args.app as "web" | "mobile" | "api" | "all") || "all";
        const limit = (args.limit as number) || 10;

        const errors = await appClient.getAppErrors(app, limit);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  errors,
                  count: errors.length,
                  filter: app,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_app_versions": {
        const versions = await appClient.getAppVersions();

        // Group by environment
        const byEnvironment = {
          production: versions.filter((v) => v.environment === "production"),
          staging: versions.filter((v) => v.environment === "staging"),
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  versions,
                  byEnvironment,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_app_store_status": {
        const [ios, android] = await Promise.all([
          appClient.getIosAppStoreStatus(),
          appClient.getAndroidPlayStoreStatus(),
        ]);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  ios: {
                    store: "App Store",
                    ...ios,
                  },
                  android: {
                    store: "Play Store",
                    ...android,
                  },
                  summary: {
                    averageRating: ((ios.rating + android.rating) / 2).toFixed(1),
                    totalReviews: ios.reviewCount + android.reviewCount,
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // =============================================================================
      // Database Tools (extended)
      // =============================================================================

      case "get_database_metrics": {
        const periodHours = (args.periodHours as number) || 24;
        const metrics = await dbClient.getDatabaseMetrics(periodHours);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(metrics, null, 2),
            },
          ],
        };
      }

      case "get_slow_queries": {
        const limit = (args.limit as number) || 10;
        const minDurationMs = (args.minDurationMs as number) || 1000;
        const queries = await dbClient.getSlowQueries(limit, minDurationMs);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  queries,
                  count: queries.length,
                  minDurationMs,
                  recommendation:
                    queries.length > 0
                      ? "Consider adding indexes or optimizing these queries"
                      : "No slow queries detected",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_table_stats": {
        const schema = (args.schema as string) || "public";
        const tables = await dbClient.getTableStats(schema);

        // Calculate totals
        const totalRows = tables.reduce((sum, t) => sum + t.rowCount, 0);
        const totalSize = tables.reduce((sum, t) => sum + t.sizeBytes, 0);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  schema,
                  tables,
                  summary: {
                    tableCount: tables.length,
                    totalRows,
                    totalSizeGb: (totalSize / 1024 / 1024 / 1024).toFixed(2),
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_backup_history": {
        const limit = (args.limit as number) || 10;
        const backups = await dbClient.getBackupHistory(limit);

        const lastSuccessful = backups.find((b) => b.status === "completed");

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  backups,
                  summary: {
                    total: backups.length,
                    completed: backups.filter((b) => b.status === "completed").length,
                    failed: backups.filter((b) => b.status === "failed").length,
                    lastSuccessful: lastSuccessful?.completedAt || "none",
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_connection_pools": {
        const poolStatus = await dbClient.getConnectionPoolStatus();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(poolStatus, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Log failed tool call
    logger.toolCall({
      tool: name,
      args: args as Record<string, unknown>,
      duration_ms: timer(),
      success: false,
      error: errorMessage,
      userId,
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: true,
            code: "TOOL_ERROR",
            message: errorMessage,
            tool: name,
          }),
        },
      ],
      isError: true,
    };
  }
});

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
    // DevOps & MLOps Resources
    {
      uri: "molecare://devops/architecture",
      name: "System Architecture",
      description: "Overview of MoleCare system architecture including services and infrastructure",
      mimeType: "application/json",
    },
    {
      uri: "molecare://devops/runbooks",
      name: "Operations Runbooks",
      description: "Common operational procedures and troubleshooting guides",
      mimeType: "application/json",
    },
    {
      uri: "molecare://mlops/model-catalog",
      name: "ML Model Catalog",
      description: "Catalog of ML models with versions, metrics, and deployment info",
      mimeType: "application/json",
    },
    {
      uri: "molecare://mlops/feature-catalog",
      name: "Feature Catalog",
      description: "Catalog of features available in the feature store",
      mimeType: "application/json",
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  // Check for ontology resources first
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

  // Check for DevOps/MLOps resources
  if (uri.startsWith("molecare://devops/") || uri.startsWith("molecare://mlops/")) {
    const devopsContent = await getDevOpsResource(uri);
    if (devopsContent) {
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(devopsContent, null, 2),
          },
        ],
      };
    }
  }

  // Check knowledge base resources
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

// DevOps/MLOps resource handler
async function getDevOpsResource(uri: string): Promise<any | null> {
  switch (uri) {
    case "molecare://devops/architecture":
      return {
        title: "MoleCare System Architecture",
        description: "Overview of the MoleCare platform architecture",
        lastUpdated: new Date().toISOString(),
        components: {
          frontend: {
            web: {
              technology: "React",
              hosting: "Vercel",
              url: "https://app.example.com",
            },
            mobile: {
              platforms: ["iOS", "Android"],
              framework: "React Native",
              appStore: "Available on App Store and Google Play",
            },
          },
          backend: {
            api: {
              technology: "Spring Boot 3.2",
              language: "Java 21",
              database: "PostgreSQL 15",
            },
            mlServing: {
              technology: "Flask + TensorFlow Serving",
              models: ["Xception", "U-Net Segmentation", "Derm Foundation"],
              gpu: "NVIDIA T4",
            },
          },
          infrastructure: {
            cloud: "AWS",
            kubernetes: "EKS",
            namespaces: ["molecare", "ml-serving", "mlops", "monitoring"],
            cicd: "GitHub Actions",
          },
          mlops: {
            experimentTracking: "MLflow + Weights & Biases",
            featureStore: "Feast (Redis online, Redshift offline)",
            orchestration: "Metaflow",
            modelRegistry: "MLflow Model Registry",
          },
          monitoring: {
            metrics: "Prometheus + Grafana",
            logging: "CloudWatch",
            alerting: "PagerDuty",
          },
        },
        dataFlow: [
          "User uploads mole image via mobile/web app",
          "Backend validates and stores image in S3",
          "ML Serving performs inference using deployed model",
          "Results stored in PostgreSQL and returned to user",
          "Features computed and stored in Feast for model training",
        ],
      };

    case "molecare://devops/runbooks":
      return {
        title: "MoleCare Operations Runbooks",
        description: "Common operational procedures and troubleshooting guides",
        lastUpdated: new Date().toISOString(),
        runbooks: [
          {
            name: "High CPU Alert",
            severity: "warning",
            symptoms: ["CPU usage > 80% for 5+ minutes"],
            steps: [
              "Check which pods are consuming CPU: kubectl top pods -n molecare",
              "Review recent deployments: kubectl rollout history deployment -n molecare",
              "Check for traffic spikes in Grafana dashboard",
              "Scale up if needed: kubectl scale deployment <name> --replicas=<n>",
            ],
            escalation: "If unresolved after 15 min, page on-call engineer",
          },
          {
            name: "ML Inference Latency High",
            severity: "warning",
            symptoms: ["P99 latency > 500ms", "Model serving response time degraded"],
            steps: [
              "Check GPU utilization on ML nodes",
              "Verify model is loaded correctly: curl /health endpoint",
              "Check for memory pressure in TensorFlow Serving",
              "Review recent model deployments",
              "Consider scaling ML serving replicas",
            ],
            escalation: "If P99 > 1s, escalate to ML Platform team",
          },
          {
            name: "Database Connection Pool Exhausted",
            severity: "critical",
            symptoms: ["Connection timeouts", "503 errors from backend"],
            steps: [
              "Check active connections: SELECT count(*) FROM pg_stat_activity",
              "Identify long-running queries",
              "Temporarily increase pool size if safe",
              "Restart affected pods if connections are leaked",
            ],
            escalation: "Immediate escalation to on-call DBA",
          },
          {
            name: "Feature Store Stale Data",
            severity: "warning",
            symptoms: ["Feature freshness > 24 hours", "Materialization job failed"],
            steps: [
              "Check Feast materialization job status",
              "Review Redshift/S3 connectivity",
              "Manually trigger materialization if needed",
              "Verify Redis online store is accessible",
            ],
            escalation: "If stale > 48 hours, escalate to Data Platform team",
          },
          {
            name: "Model Deployment Rollback",
            severity: "critical",
            symptoms: ["New model version causing errors", "Accuracy degradation detected"],
            steps: [
              "Identify current champion and failed challenger versions",
              "Update traffic routing to 100% champion",
              "Archive failed model version in MLflow",
              "Investigate root cause before next deployment",
            ],
            escalation: "Notify ML team lead immediately",
          },
        ],
        contacts: {
          onCall: "Configure via ONCALL_PROVIDER env",
          slack: "#your-incidents-channel",
          email: "oncall@example.com",
        },
      };

    case "molecare://mlops/model-catalog":
      return {
        title: "MoleCare ML Model Catalog",
        description: "Catalog of ML models used in production",
        lastUpdated: new Date().toISOString(),
        models: [
          {
            name: "melanoma-classifier-xception",
            purpose: "Primary melanoma detection classifier",
            architecture: "Xception (transfer learning)",
            inputShape: [299, 299, 3],
            outputClasses: ["benign", "malignant"],
            metrics: {
              auc: 0.923,
              accuracy: 0.891,
              precision: 0.887,
              recall: 0.856,
            },
            currentVersion: "3",
            stage: "Production",
            trainingData: "ISIC 2020 + proprietary dataset",
            lastTrained: "2024-01-15",
          },
          {
            name: "mole-segmentation-unet",
            purpose: "Mole boundary detection and segmentation",
            architecture: "U-Net",
            inputShape: [256, 256, 3],
            outputShape: [256, 256, 1],
            metrics: {
              iou: 0.87,
              dice: 0.91,
            },
            currentVersion: "1",
            stage: "Production",
            trainingData: "PH2 Dataset + manual annotations",
            lastTrained: "2024-01-01",
          },
          {
            name: "derm-foundation-classifier",
            purpose: "Advanced prediction using Google Derm Foundation",
            architecture: "Fine-tuned Derm Foundation",
            inputShape: [380, 380, 3],
            outputClasses: ["multiple dermatology conditions"],
            metrics: {
              auc: 0.945,
              topKAccuracy: 0.92,
            },
            currentVersion: "1",
            stage: "Staging",
            note: "Experimental - requires premium subscription",
            lastTrained: "2024-01-20",
          },
        ],
        deploymentPattern: {
          type: "Champion-Challenger",
          championTraffic: 0.9,
          challengerTraffic: 0.1,
          promoCriteria: "AUC improvement > 2% with statistical significance",
        },
      };

    case "molecare://mlops/feature-catalog":
      return {
        title: "MoleCare Feature Catalog",
        description: "Catalog of features available in Feast feature store",
        lastUpdated: new Date().toISOString(),
        featureViews: [
          {
            name: "user_features",
            entity: "user_id",
            description: "User-level aggregated features",
            features: [
              { name: "skin_type", dtype: "INT32", description: "Fitzpatrick skin type (1-6)" },
              { name: "has_family_history", dtype: "BOOL", description: "Family history of melanoma" },
              { name: "total_moles_count", dtype: "INT32", description: "Total moles tracked" },
              { name: "high_risk_moles_count", dtype: "INT32", description: "High-risk mole count" },
              { name: "average_risk_score", dtype: "FLOAT", description: "Average risk across moles" },
            ],
            freshness: "Materialized every hour",
            source: "Redshift ml_features.user_features",
          },
          {
            name: "mole_features",
            entity: "mole_id",
            description: "Per-mole analysis features",
            features: [
              { name: "asymmetry_score", dtype: "FLOAT", description: "ABCDE asymmetry score" },
              { name: "border_score", dtype: "FLOAT", description: "ABCDE border score" },
              { name: "color_score", dtype: "FLOAT", description: "ABCDE color score" },
              { name: "diameter_mm", dtype: "FLOAT", description: "Mole diameter in mm" },
              { name: "evolution_score", dtype: "FLOAT", description: "Change over time score" },
              { name: "image_count", dtype: "INT32", description: "Number of images" },
              { name: "days_tracked", dtype: "INT32", description: "Days since first image" },
            ],
            freshness: "Materialized every 2 hours",
            source: "Redshift ml_features.mole_features",
          },
          {
            name: "image_embeddings",
            entity: "image_id",
            description: "Image embedding vectors for similarity",
            features: [
              { name: "embedding_vector", dtype: "FLOAT_LIST[512]", description: "512-dim embedding" },
              { name: "model_type", dtype: "STRING", description: "Embedding model used" },
            ],
            freshness: "Batch updated weekly",
            source: "S3 parquet files",
          },
        ],
        onlineStore: {
          type: "Redis",
          latencyP99: "< 5ms",
          endpoint: "redis-feast.mlops.svc.cluster.local:6379",
        },
        offlineStore: {
          type: "Redshift",
          retentionDays: 365,
          schema: "ml_features",
        },
      };

    default:
      return null;
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getAsymmetryDescription(score: number): string {
  if (score < 0.3) return "Symmetric - both halves match well";
  if (score < 0.6) return "Slightly asymmetric - minor differences between halves";
  return "Asymmetric - significant differences between halves";
}

function getBorderDescription(score: number): string {
  if (score < 0.3) return "Smooth, well-defined border";
  if (score < 0.6) return "Slightly irregular border";
  return "Irregular, ragged, or blurred border";
}

function getColorDescription(score: number): string {
  if (score < 0.3) return "Uniform color throughout";
  if (score < 0.6) return "Some color variation present";
  return "Multiple colors or significant variation";
}

function getDiameterDescription(diameter: number): string {
  if (diameter < 6) return `${diameter}mm - within normal range`;
  return `${diameter}mm - larger than 6mm (pencil eraser size)`;
}

function getEvolutionDescription(score: number): string {
  if (score < 0.3) return "Stable - no significant changes detected";
  if (score < 0.6) return "Some changes detected - continue monitoring";
  return "Significant changes detected - recommend professional evaluation";
}

function getTrendDescription(trend: string): string {
  switch (trend) {
    case "STABLE":
      return "The mole has remained stable over time with no concerning changes.";
    case "SLIGHT_CHANGE":
      return "Minor changes have been detected. Continue regular monitoring.";
    case "SIGNIFICANT_CHANGE":
      return "Notable changes have been detected. Consider scheduling a dermatologist visit.";
    case "RAPID_CHANGE":
      return "Rapid changes detected. Please seek professional medical evaluation promptly.";
    default:
      return "Trend data not available.";
  }
}

function getRecommendation(riskLevel: string): string {
  switch (riskLevel) {
    case "LOW":
      return "Continue regular self-monitoring. Take a new photo every 1-3 months.";
    case "MODERATE":
      return "Monitor more frequently. Consider scheduling a routine dermatologist visit.";
    case "ELEVATED":
      return "Schedule a dermatologist appointment within the next 2 weeks.";
    case "HIGH":
      return "Please seek professional medical evaluation as soon as possible.";
    default:
      return "Continue regular monitoring and consult a healthcare provider if concerned.";
  }
}

function getPersonalizedRecommendations(profile: any): string[] {
  const recommendations: string[] = [];

  if (profile.skinType <= 2) {
    recommendations.push("Your fair skin type has higher UV sensitivity. Use SPF 30+ sunscreen daily.");
  }

  if (profile.riskFactors?.includes("FAMILY_HISTORY")) {
    recommendations.push("Given your family history, annual professional skin exams are recommended.");
  }

  if (profile.riskFactors?.includes("MANY_MOLES")) {
    recommendations.push("With multiple moles, regular self-examinations are important. Document any changes.");
  }

  recommendations.push("Take photos of moles monthly to track any changes over time.");

  return recommendations;
}

// =============================================================================
// START SERVER
// =============================================================================

async function main() {
  console.error("Starting MoleCare MCP Server...");

  // Health check HTTP server for ECS/Docker health probes.
  //
  // Only bind when a port is explicitly configured. Desktop MCP clients run this
  // over stdio and have no use for the endpoint, and binding by default would
  // collide with whatever the user already has on port 3000. Container images set
  // PORT (see Dockerfile), so probes there are unaffected.
  const configuredPort = process.env.MCP_HEALTH_PORT || process.env.PORT;
  if (configuredPort) {
    const port = parseInt(configuredPort, 10);
    const healthServer = createServer((req, res) => {
      if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    // A health endpoint is never worth taking the MCP server down for.
    healthServer.on("error", (error) => {
      console.error(`Health check endpoint unavailable on port ${port}: ${error}`);
    });
    healthServer.listen(port, () => {
      console.error(`Health check endpoint listening on port ${port}`);
    });
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("MoleCare MCP Server running");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
