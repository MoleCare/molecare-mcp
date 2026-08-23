/**
 * MLflow API Client
 * ==================
 *
 * Provides access to MLflow tracking server for:
 * - Experiments and runs
 * - Model registry
 * - Metrics and parameters
 * - Artifact information
 */

import axios, { AxiosInstance } from "axios";

export interface MLflowConfig {
  baseUrl: string;
  apiKey?: string;
}

export interface Experiment {
  experimentId: string;
  name: string;
  artifactLocation: string;
  lifecycleStage: string;
  lastUpdateTime: number;
  creationTime: number;
  tags: Record<string, string>;
}

export interface Run {
  runId: string;
  experimentId: string;
  status: "RUNNING" | "SCHEDULED" | "FINISHED" | "FAILED" | "KILLED";
  startTime: number;
  endTime?: number;
  artifactUri: string;
  lifecycleStage: string;
  metrics: Metric[];
  params: Param[];
  tags: Record<string, string>;
}

export interface Metric {
  key: string;
  value: number;
  timestamp: number;
  step: number;
}

export interface Param {
  key: string;
  value: string;
}

export interface RegisteredModel {
  name: string;
  creationTimestamp: number;
  lastUpdatedTimestamp: number;
  description?: string;
  latestVersions: ModelVersion[];
  tags: Record<string, string>;
}

export interface ModelVersion {
  name: string;
  version: string;
  creationTimestamp: number;
  lastUpdatedTimestamp: number;
  currentStage: "None" | "Staging" | "Production" | "Archived";
  description?: string;
  source: string;
  runId: string;
  status: "PENDING_REGISTRATION" | "FAILED_REGISTRATION" | "READY";
  tags: Record<string, string>;
}

export class MLflowApiClient {
  private client: AxiosInstance;
  private useMockData: boolean;

  constructor(config: MLflowConfig) {
    this.client = axios.create({
      baseURL: config.baseUrl,
      headers: config.apiKey
        ? { Authorization: `Bearer ${config.apiKey}` }
        : {},
      timeout: 10000,
    });

    // Use mock data if not in production or if API is unavailable
    this.useMockData = process.env.NODE_ENV !== "production";
  }

  /**
   * List all experiments
   */
  async listExperiments(): Promise<Experiment[]> {
    if (this.useMockData) {
      return this.getMockExperiments();
    }

    try {
      const response = await this.client.get("/api/2.0/mlflow/experiments/list");
      return response.data.experiments || [];
    } catch (error) {
      console.error("MLflow API error, using mock data:", error);
      return this.getMockExperiments();
    }
  }

  /**
   * Get experiment by ID
   */
  async getExperiment(experimentId: string): Promise<Experiment | null> {
    if (this.useMockData) {
      const experiments = this.getMockExperiments();
      return experiments.find((e) => e.experimentId === experimentId) || null;
    }

    try {
      const response = await this.client.get("/api/2.0/mlflow/experiments/get", {
        params: { experiment_id: experimentId },
      });
      return response.data.experiment;
    } catch (error) {
      console.error("MLflow API error:", error);
      return null;
    }
  }

  /**
   * Search runs in an experiment
   */
  async searchRuns(
    experimentIds: string[],
    filter?: string,
    maxResults: number = 100
  ): Promise<Run[]> {
    if (this.useMockData) {
      return this.getMockRuns(experimentIds[0]);
    }

    try {
      const response = await this.client.post("/api/2.0/mlflow/runs/search", {
        experiment_ids: experimentIds,
        filter_string: filter,
        max_results: maxResults,
        order_by: ["start_time DESC"],
      });
      return response.data.runs || [];
    } catch (error) {
      console.error("MLflow API error, using mock data:", error);
      return this.getMockRuns(experimentIds[0]);
    }
  }

  /**
   * Get run by ID
   */
  async getRun(runId: string): Promise<Run | null> {
    if (this.useMockData) {
      const runs = this.getMockRuns("1");
      return runs.find((r) => r.runId === runId) || null;
    }

    try {
      const response = await this.client.get("/api/2.0/mlflow/runs/get", {
        params: { run_id: runId },
      });
      return response.data.run;
    } catch (error) {
      console.error("MLflow API error:", error);
      return null;
    }
  }

  /**
   * Get metric history for a run
   */
  async getMetricHistory(runId: string, metricKey: string): Promise<Metric[]> {
    if (this.useMockData) {
      return this.getMockMetricHistory(metricKey);
    }

    try {
      const response = await this.client.get(
        "/api/2.0/mlflow/metrics/get-history",
        {
          params: { run_id: runId, metric_key: metricKey },
        }
      );
      return response.data.metrics || [];
    } catch (error) {
      console.error("MLflow API error:", error);
      return this.getMockMetricHistory(metricKey);
    }
  }

  /**
   * List registered models
   */
  async listRegisteredModels(): Promise<RegisteredModel[]> {
    if (this.useMockData) {
      return this.getMockRegisteredModels();
    }

    try {
      const response = await this.client.get(
        "/api/2.0/mlflow/registered-models/list"
      );
      return response.data.registered_models || [];
    } catch (error) {
      console.error("MLflow API error, using mock data:", error);
      return this.getMockRegisteredModels();
    }
  }

  /**
   * Get registered model by name
   */
  async getRegisteredModel(name: string): Promise<RegisteredModel | null> {
    if (this.useMockData) {
      const models = this.getMockRegisteredModels();
      return models.find((m) => m.name === name) || null;
    }

    try {
      const response = await this.client.get(
        "/api/2.0/mlflow/registered-models/get",
        {
          params: { name },
        }
      );
      return response.data.registered_model;
    } catch (error) {
      console.error("MLflow API error:", error);
      return null;
    }
  }

  /**
   * Get model version
   */
  async getModelVersion(
    name: string,
    version: string
  ): Promise<ModelVersion | null> {
    if (this.useMockData) {
      const models = this.getMockRegisteredModels();
      const model = models.find((m) => m.name === name);
      return (
        model?.latestVersions.find((v) => v.version === version) || null
      );
    }

    try {
      const response = await this.client.get(
        "/api/2.0/mlflow/model-versions/get",
        {
          params: { name, version },
        }
      );
      return response.data.model_version;
    } catch (error) {
      console.error("MLflow API error:", error);
      return null;
    }
  }

  /**
   * Compare metrics between runs
   */
  async compareRuns(runIds: string[]): Promise<{
    runs: Run[];
    comparison: Record<string, Record<string, number>>;
  }> {
    const runs: Run[] = [];
    for (const runId of runIds) {
      const run = await this.getRun(runId);
      if (run) runs.push(run);
    }

    const comparison: Record<string, Record<string, number>> = {};
    for (const run of runs) {
      comparison[run.runId] = {};
      for (const metric of run.metrics) {
        comparison[run.runId][metric.key] = metric.value;
      }
    }

    return { runs, comparison };
  }

  // ==========================================================================
  // MOCK DATA
  // ==========================================================================

  private getMockExperiments(): Experiment[] {
    const now = Date.now();
    return [
      {
        experimentId: "1",
        name: "melanoma-detection-xception",
        artifactLocation: "s3://mlops-artifacts/mlflow/1",
        lifecycleStage: "active",
        lastUpdateTime: now - 3600000,
        creationTime: now - 86400000 * 30,
        tags: { team: "ml-platform", model_type: "classification" },
      },
      {
        experimentId: "2",
        name: "melanoma-detection-efficientnet",
        artifactLocation: "s3://mlops-artifacts/mlflow/2",
        lifecycleStage: "active",
        lastUpdateTime: now - 7200000,
        creationTime: now - 86400000 * 20,
        tags: { team: "ml-platform", model_type: "classification" },
      },
      {
        experimentId: "3",
        name: "mole-segmentation",
        artifactLocation: "s3://mlops-artifacts/mlflow/3",
        lifecycleStage: "active",
        lastUpdateTime: now - 86400000,
        creationTime: now - 86400000 * 15,
        tags: { team: "ml-platform", model_type: "segmentation" },
      },
      {
        experimentId: "4",
        name: "derm-foundation-finetuning",
        artifactLocation: "s3://mlops-artifacts/mlflow/4",
        lifecycleStage: "active",
        lastUpdateTime: now - 172800000,
        creationTime: now - 86400000 * 7,
        tags: { team: "ml-platform", model_type: "foundation" },
      },
    ];
  }

  private getMockRuns(experimentId: string): Run[] {
    const now = Date.now();
    return [
      {
        runId: "run-001-abc123",
        experimentId,
        status: "FINISHED",
        startTime: now - 86400000,
        endTime: now - 82800000,
        artifactUri: `s3://mlops-artifacts/mlflow/${experimentId}/run-001-abc123`,
        lifecycleStage: "active",
        metrics: [
          { key: "auc", value: 0.923, timestamp: now - 82800000, step: 50 },
          { key: "accuracy", value: 0.891, timestamp: now - 82800000, step: 50 },
          { key: "precision", value: 0.887, timestamp: now - 82800000, step: 50 },
          { key: "recall", value: 0.856, timestamp: now - 82800000, step: 50 },
          { key: "val_loss", value: 0.234, timestamp: now - 82800000, step: 50 },
        ],
        params: [
          { key: "learning_rate", value: "0.001" },
          { key: "batch_size", value: "16" },
          { key: "epochs", value: "50" },
          { key: "optimizer", value: "adam" },
          { key: "architecture", value: "xception" },
        ],
        tags: { "mlflow.user": "yauhen", deployment_ready: "true" },
      },
      {
        runId: "run-002-def456",
        experimentId,
        status: "FINISHED",
        startTime: now - 172800000,
        endTime: now - 169200000,
        artifactUri: `s3://mlops-artifacts/mlflow/${experimentId}/run-002-def456`,
        lifecycleStage: "active",
        metrics: [
          { key: "auc", value: 0.912, timestamp: now - 169200000, step: 50 },
          { key: "accuracy", value: 0.883, timestamp: now - 169200000, step: 50 },
          { key: "precision", value: 0.879, timestamp: now - 169200000, step: 50 },
          { key: "recall", value: 0.841, timestamp: now - 169200000, step: 50 },
          { key: "val_loss", value: 0.267, timestamp: now - 169200000, step: 50 },
        ],
        params: [
          { key: "learning_rate", value: "0.0001" },
          { key: "batch_size", value: "32" },
          { key: "epochs", value: "50" },
          { key: "optimizer", value: "adam" },
          { key: "architecture", value: "xception" },
        ],
        tags: { "mlflow.user": "yauhen" },
      },
      {
        runId: "run-003-ghi789",
        experimentId,
        status: "RUNNING",
        startTime: now - 3600000,
        artifactUri: `s3://mlops-artifacts/mlflow/${experimentId}/run-003-ghi789`,
        lifecycleStage: "active",
        metrics: [
          { key: "auc", value: 0.876, timestamp: now - 1800000, step: 25 },
          { key: "accuracy", value: 0.854, timestamp: now - 1800000, step: 25 },
          { key: "val_loss", value: 0.312, timestamp: now - 1800000, step: 25 },
        ],
        params: [
          { key: "learning_rate", value: "0.0005" },
          { key: "batch_size", value: "16" },
          { key: "epochs", value: "100" },
          { key: "optimizer", value: "adamw" },
          { key: "architecture", value: "efficientnetb4" },
        ],
        tags: { "mlflow.user": "yauhen" },
      },
    ];
  }

  private getMockMetricHistory(metricKey: string): Metric[] {
    const now = Date.now();
    const steps = 50;
    const metrics: Metric[] = [];

    for (let i = 0; i <= steps; i++) {
      let value: number;
      if (metricKey === "auc" || metricKey === "accuracy") {
        value = 0.5 + (0.4 * i) / steps + Math.random() * 0.02;
      } else if (metricKey === "val_loss") {
        value = 1.0 - (0.7 * i) / steps + Math.random() * 0.05;
      } else {
        value = Math.random();
      }

      metrics.push({
        key: metricKey,
        value: Math.min(1, Math.max(0, value)),
        timestamp: now - (steps - i) * 60000,
        step: i,
      });
    }

    return metrics;
  }

  private getMockRegisteredModels(): RegisteredModel[] {
    const now = Date.now();
    return [
      {
        name: "melanoma-classifier-xception",
        creationTimestamp: now - 86400000 * 30,
        lastUpdatedTimestamp: now - 3600000,
        description: "Xception-based melanoma detection model",
        latestVersions: [
          {
            name: "melanoma-classifier-xception",
            version: "3",
            creationTimestamp: now - 3600000,
            lastUpdatedTimestamp: now - 3600000,
            currentStage: "Production",
            description: "Best performing model with AUC 0.923",
            source: "s3://mlops-artifacts/mlflow/1/run-001-abc123/artifacts/model",
            runId: "run-001-abc123",
            status: "READY",
            tags: { champion: "true", auc: "0.923" },
          },
          {
            name: "melanoma-classifier-xception",
            version: "2",
            creationTimestamp: now - 172800000,
            lastUpdatedTimestamp: now - 172800000,
            currentStage: "Staging",
            description: "Challenger model for A/B testing",
            source: "s3://mlops-artifacts/mlflow/1/run-002-def456/artifacts/model",
            runId: "run-002-def456",
            status: "READY",
            tags: { challenger: "true", auc: "0.912" },
          },
        ],
        tags: { model_type: "classification", framework: "tensorflow" },
      },
      {
        name: "mole-segmentation-unet",
        creationTimestamp: now - 86400000 * 20,
        lastUpdatedTimestamp: now - 86400000,
        description: "U-Net model for mole segmentation",
        latestVersions: [
          {
            name: "mole-segmentation-unet",
            version: "1",
            creationTimestamp: now - 86400000,
            lastUpdatedTimestamp: now - 86400000,
            currentStage: "Production",
            description: "Segmentation model for mole detection",
            source: "s3://mlops-artifacts/mlflow/3/run-seg-001/artifacts/model",
            runId: "run-seg-001",
            status: "READY",
            tags: { iou: "0.87" },
          },
        ],
        tags: { model_type: "segmentation", framework: "tensorflow" },
      },
      {
        name: "derm-foundation-classifier",
        creationTimestamp: now - 86400000 * 7,
        lastUpdatedTimestamp: now - 172800000,
        description: "Fine-tuned Google Derm Foundation model",
        latestVersions: [
          {
            name: "derm-foundation-classifier",
            version: "1",
            creationTimestamp: now - 172800000,
            lastUpdatedTimestamp: now - 172800000,
            currentStage: "Staging",
            description: "Experimental foundation model",
            source: "s3://mlops-artifacts/mlflow/4/run-df-001/artifacts/model",
            runId: "run-df-001",
            status: "READY",
            tags: { auc: "0.945", experimental: "true" },
          },
        ],
        tags: { model_type: "foundation", framework: "jax" },
      },
    ];
  }
}
