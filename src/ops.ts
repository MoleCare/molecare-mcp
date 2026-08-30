#!/usr/bin/env node

/**
 * MoleCare Ops MCP Server (internal)
 * ==================================
 *
 * Infrastructure, MLOps and CI/CD tooling for the MoleCare team: EC2 and
 * CloudWatch, Kubernetes, databases, MLflow, the Feast feature store, CI
 * pipelines and app health.
 *
 * This is deliberately a SEPARATE binary from the public `molecare-mcp`
 * bridge. These tools are meaningless outside MoleCare infrastructure and
 * return mock data without credentials, so shipping them in the public tool
 * list only made it harder for a model to find the tools that matter.
 *
 * Usage:
 *   npx molecare-ops-mcp
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { MoleCareApiClient } from "./api/molecare-client.js";

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
import { logger } from "./utils/logger.js";
import { performHealthCheck, formatUptime } from "./utils/health.js";
import { registerTools, startServer, type ToolContext } from "./runtime.js";

// The ops server also probes the MoleCare backend as part of get_system_health
const apiClient = new MoleCareApiClient({
  baseUrl: process.env.MOLECARE_API_URL || "http://localhost:8080/api",
  apiKey: process.env.MOLECARE_API_KEY || "",
});

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
    name: "molecare-ops-mcp",
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
// TOOLS - Infrastructure, MLOps and CI/CD
// =============================================================================

const OPS_TOOLS = [

    {
      name: "get_app_status",
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
      description:
        "Get connection pool status for all database clients showing active, idle, and waiting connections.",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
];

// Tool cost mapping for rate limiting
const TOOL_COSTS: Record<string, number> = {
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

async function dispatch(
  name: string,
  args: Record<string, any>,
  ctx: ToolContext
) {
  const { userId, timer } = ctx;

  switch (name) {

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
}

registerTools(server, OPS_TOOLS, TOOL_COSTS, dispatch);

// =============================================================================
// RESOURCES
// =============================================================================

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
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

  const devopsContent = await getDevOpsResource(uri);
  if (!devopsContent) {
    throw new Error(`Resource not found: ${uri}`);
  }

  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(devopsContent, null, 2),
      },
    ],
  };
});


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
// START SERVER
// =============================================================================

startServer(server, "MoleCare Ops MCP Server").catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
