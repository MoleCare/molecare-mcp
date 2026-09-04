/**
 * Zod schemas for tool input validation
 * Validates inputs before processing to prevent errors
 */

import { z } from "zod";

// =============================================================================
// Infrastructure Tools
// =============================================================================

export const GetAppStatusSchema = z.object({
  appType: z.enum(["web", "mobile", "backend", "ml-serving", "all"]).optional(),
});

export const GetKubernetesStatusSchema = z.object({
  namespace: z.string().min(1).optional(),
});

export const GetDeploymentsSchema = z.object({
  namespace: z.string().min(1).optional(),
});

// =============================================================================
// CI/CD Tools
// =============================================================================

export const GetPipelineRunsSchema = z.object({
  workflow: z.string().optional(),
  limit: z.number().min(1).max(100).optional().default(10),
});

export const GetPipelineSummarySchema = z.object({
  days: z.number().min(1).max(90).optional().default(7),
});

export const GetTrainingRunsSchema = z.object({
  flowName: z.string().optional(),
  limit: z.number().min(1).max(100).optional().default(10),
});

export const GetDeploymentStatusSchema = z.object({
  environment: z.enum(["staging", "production"]).optional(),
});

export const GetReleasesSchema = z.object({
  limit: z.number().min(1).max(50).optional().default(10),
});

// =============================================================================
// MLflow Tools
// =============================================================================

export const GetMlflowRunsSchema = z.object({
  experimentId: z.string().min(1, "experimentId is required"),
  filter: z.string().optional(),
  limit: z.number().min(1).max(1000).optional().default(10),
});

export const GetModelVersionSchema = z.object({
  modelName: z.string().min(1, "modelName is required"),
  version: z.string().min(1, "version is required"),
});

export const CompareModelRunsSchema = z.object({
  runIds: z
    .array(z.string().min(1))
    .min(2, "At least 2 run IDs required for comparison")
    .max(10, "Maximum 10 runs can be compared"),
});

// =============================================================================
// Feast Tools
// =============================================================================

export const GetFeatureViewDetailsSchema = z.object({
  name: z.string().min(1, "Feature view name is required"),
});

export const GetOnlineFeaturesSchema = z.object({
  featureView: z.string().min(1, "featureView is required"),
  entityKey: z.record(z.string(), z.unknown()).refine(
    (obj) => Object.keys(obj).length > 0,
    "entityKey must have at least one key"
  ),
});

// =============================================================================
// Clinical Tools
// =============================================================================

export const GetUserMolesSchema = z.object({
  userId: z.string().min(1, "userId is required"),
});

export const GetMoleAnalysisSchema = z.object({
  moleId: z.string().min(1, "moleId is required"),
});

export const CompareMolesSchema = z.object({
  moleId: z.string().min(1),
  imageId1: z.string().min(1),
  imageId2: z.string().min(1),
});

export const ClassifyLesionFeaturesSchema = z.object({
  asymmetry: z.boolean().optional(),
  irregularBorder: z.boolean().optional(),
  multipleColors: z.boolean().optional(),
  diameterMm: z.number().min(0).max(50).optional(),
  hasChanged: z.boolean().optional(),
});

// =============================================================================
// EC2 Tools
// =============================================================================

export const GetEC2InstancesSchema = z.object({
  environment: z.enum(["production", "staging", "all"]).optional(),
});

export const GetEC2InstanceSchema = z.object({
  instanceId: z.string().min(1, "instanceId is required"),
});

export const GetEC2HealthSchema = z.object({
  instanceId: z.string().optional(),
});

export const GetEC2MetricsSchema = z.object({
  instanceId: z.string().min(1, "instanceId is required"),
  periodMinutes: z.number().min(5).max(1440).optional().default(60),
});

export const CheckServerHealthSchema = z.object({
  instanceId: z.string().min(1, "instanceId is required"),
});

// =============================================================================
// App Monitoring Tools
// =============================================================================

export const GetAppMetricsSchema = z.object({
  app: z.enum(["web", "mobile", "api"]),
  periodHours: z.number().min(1).max(168).optional().default(24),
});

export const GetAppErrorsSchema = z.object({
  app: z.enum(["web", "mobile", "api", "all"]).optional().default("all"),
  limit: z.number().min(1).max(100).optional().default(10),
});

// =============================================================================
// Database Tools
// =============================================================================

export const GetDatabaseMetricsSchema = z.object({
  periodHours: z.number().min(1).max(168).optional().default(24),
});

export const GetSlowQueriesSchema = z.object({
  limit: z.number().min(1).max(50).optional().default(10),
  minDurationMs: z.number().min(100).max(60000).optional().default(1000),
});

export const GetTableStatsSchema = z.object({
  schema: z.string().min(1).optional().default("public"),
});

export const GetBackupHistorySchema = z.object({
  limit: z.number().min(1).max(30).optional().default(10),
});

// =============================================================================
// Validation Helper
// =============================================================================

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Validate tool input and return typed result or error message
 */
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  input: unknown
): ValidationResult<T> {
  const result = schema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  // Format Zod errors nicely
  const errors = result.error.issues
    .map((e) => `${e.path.join(".")}: ${e.message}`)
    .join("; ");

  return { success: false, error: errors };
}

/**
 * Schema map for easy lookup by tool name
 */
export const TOOL_SCHEMAS: Record<string, z.ZodSchema<any>> = {
  // Infrastructure
  get_app_status: GetAppStatusSchema,
  get_kubernetes_status: GetKubernetesStatusSchema,
  get_deployments: GetDeploymentsSchema,
  // CI/CD
  get_pipeline_runs: GetPipelineRunsSchema,
  get_pipeline_summary: GetPipelineSummarySchema,
  get_training_runs: GetTrainingRunsSchema,
  get_deployment_status: GetDeploymentStatusSchema,
  get_releases: GetReleasesSchema,
  // MLflow
  get_mlflow_runs: GetMlflowRunsSchema,
  get_model_version: GetModelVersionSchema,
  compare_model_runs: CompareModelRunsSchema,
  // Feast
  get_feature_view_details: GetFeatureViewDetailsSchema,
  get_online_features: GetOnlineFeaturesSchema,
  // Clinical
  get_user_moles: GetUserMolesSchema,
  get_mole_analysis: GetMoleAnalysisSchema,
  compare_moles: CompareMolesSchema,
  classify_lesion_features: ClassifyLesionFeaturesSchema,
  // EC2
  get_ec2_instances: GetEC2InstancesSchema,
  get_ec2_instance: GetEC2InstanceSchema,
  get_ec2_health: GetEC2HealthSchema,
  get_ec2_metrics: GetEC2MetricsSchema,
  check_server_health: CheckServerHealthSchema,
  // App Monitoring
  get_app_metrics: GetAppMetricsSchema,
  get_app_errors: GetAppErrorsSchema,
  // Database
  get_database_metrics: GetDatabaseMetricsSchema,
  get_slow_queries: GetSlowQueriesSchema,
  get_table_stats: GetTableStatsSchema,
  get_backup_history: GetBackupHistorySchema,
};
