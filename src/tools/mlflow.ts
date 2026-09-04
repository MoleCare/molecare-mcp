/**
 * MLflow and model-registry tools for molecare-ops-mcp.
 *
 * Command objects own each tool's schema, cost, and behaviour. The catalog
 * is the only place ops.ts talks to.
 */

import type {
  Experiment,
  MLflowApiClient,
  RegisteredModel,
  Run,
} from "../api/mlflow-client.js";
import type { ToolContext } from "../runtime.js";
import { cache, CACHE_TTL } from "../utils/cache.js";
import { logger } from "../utils/logger.js";
import {
  jsonResult,
  ToolCatalog,
  toolError,
  type ToolCommand,
} from "./tool-catalog.js";

const EXPERIMENTS_CACHE_KEY = "mlflow:experiments";
const REGISTERED_MODELS_CACHE_KEY = "mlflow:registered_models";

export interface MlflowDeps {
  client: MLflowApiClient;
}

function readString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${key} must be a non-empty string`);
  }
  return value;
}

function readOptionalString(
  args: Record<string, unknown>,
  key: string
): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readLimit(args: Record<string, unknown>, fallback = 10): number {
  const value = args.limit;
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readStringList(args: Record<string, unknown>, key: string): string[] {
  const value = args[key];
  if (!Array.isArray(value)) {
    throw new Error(`${key} must be an array of strings`);
  }
  return value.filter((item): item is string => typeof item === "string");
}

function recordPairs(items: Array<{ key: string; value: string | number }>) {
  return Object.fromEntries(items.map((item) => [item.key, item.value]));
}

function presentExperiment(experiment: Experiment) {
  return {
    id: experiment.experimentId,
    name: experiment.name,
    lifecycleStage: experiment.lifecycleStage,
    lastUpdated: new Date(experiment.lastUpdateTime).toISOString(),
    tags: experiment.tags,
  };
}

function presentRun(run: Run) {
  return {
    runId: run.runId,
    status: run.status,
    startTime: new Date(run.startTime).toISOString(),
    endTime: run.endTime ? new Date(run.endTime).toISOString() : null,
    metrics: recordPairs(run.metrics),
    params: recordPairs(run.params),
    tags: run.tags,
  };
}

function presentRegisteredModel(model: RegisteredModel) {
  return {
    name: model.name,
    description: model.description,
    latestVersions: model.latestVersions.map((version) => ({
      version: version.version,
      stage: version.currentStage,
      status: version.status,
      runId: version.runId,
    })),
    tags: model.tags,
  };
}

function presentComparedRun(run: Run) {
  return {
    runId: run.runId,
    status: run.status,
    params: recordPairs(run.params),
  };
}

function logCachedList(name: string, ctx: ToolContext) {
  logger.toolCall({
    tool: name,
    args: {},
    duration_ms: ctx.timer(),
    success: true,
    userId: ctx.userId,
  });
}

class ListExperimentsCommand implements ToolCommand<MlflowDeps> {
  readonly cost = 1;
  readonly definition = {
    name: "get_mlflow_experiments",
    description:
      "List all MLflow experiments with their status and last update time.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  };

  async execute({ client }: MlflowDeps, _args: Record<string, unknown>, ctx: ToolContext) {
    const experiments = await cache.getOrFetch(
      EXPERIMENTS_CACHE_KEY,
      () => client.listExperiments(),
      CACHE_TTL.LONG
    );
    logCachedList(this.definition.name, ctx);
    return jsonResult({
      experiments: experiments.map(presentExperiment),
      count: experiments.length,
    });
  }
}

class ListRunsCommand implements ToolCommand<MlflowDeps> {
  readonly cost = 2;
  readonly definition = {
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
  };

  async execute({ client }: MlflowDeps, args: Record<string, unknown>) {
    const experimentId = readString(args, "experimentId");
    const runs = await client.searchRuns(
      [experimentId],
      readOptionalString(args, "filter"),
      readLimit(args)
    );
    return jsonResult({
      experimentId,
      runs: runs.map(presentRun),
      count: runs.length,
    });
  }
}

class ListRegisteredModelsCommand implements ToolCommand<MlflowDeps> {
  readonly cost = 1;
  readonly definition = {
    name: "get_registered_models",
    description:
      "List all registered ML models in MLflow model registry with versions and stages.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  };

  async execute({ client }: MlflowDeps, _args: Record<string, unknown>, ctx: ToolContext) {
    const models = await cache.getOrFetch(
      REGISTERED_MODELS_CACHE_KEY,
      () => client.listRegisteredModels(),
      CACHE_TTL.LONG
    );
    logCachedList(this.definition.name, ctx);
    return jsonResult({
      models: models.map(presentRegisteredModel),
      count: models.length,
    });
  }
}

class GetModelVersionCommand implements ToolCommand<MlflowDeps> {
  readonly cost = 1;
  readonly definition = {
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
  };

  async execute({ client }: MlflowDeps, args: Record<string, unknown>) {
    const modelName = readString(args, "modelName");
    const version = readString(args, "version");
    const model = await client.getModelVersion(modelName, version);
    if (!model) {
      return toolError(`Model version ${modelName}:${version} not found`);
    }
    return jsonResult({ model });
  }
}

class CompareModelRunsCommand implements ToolCommand<MlflowDeps> {
  readonly cost = 3;
  readonly definition = {
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
  };

  async execute({ client }: MlflowDeps, args: Record<string, unknown>) {
    const comparison = await client.compareRuns(readStringList(args, "runIds"));
    return jsonResult({
      comparison: comparison.comparison,
      runs: comparison.runs.map(presentComparedRun),
    });
  }
}

const MLFLOW_COMMANDS: readonly ToolCommand<MlflowDeps>[] = [
  new ListExperimentsCommand(),
  new ListRunsCommand(),
  new ListRegisteredModelsCommand(),
  new GetModelVersionCommand(),
  new CompareModelRunsCommand(),
];

export class MlflowTools extends ToolCatalog<MlflowDeps> {
  constructor(client: MLflowApiClient) {
    super({ client }, MLFLOW_COMMANDS);
  }
}
