/**
 * Feast Feature Store Client
 * ============================
 *
 * Provides access to Feast feature store for:
 * - Feature views and definitions
 * - Feature values (online store)
 * - Entity information
 * - Feature freshness monitoring
 */

import axios, { AxiosInstance } from "axios";

export interface FeastConfig {
  baseUrl: string;
  projectName?: string;
}

// =============================================================================
// Types
// =============================================================================

export interface FeatureView {
  name: string;
  description?: string;
  entities: string[];
  features: FeatureDefinition[];
  source: DataSource;
  ttl?: string;
  tags: Record<string, string>;
  createdAt: string;
  lastUpdatedAt: string;
}

export interface FeatureDefinition {
  name: string;
  dtype: string;
  description?: string;
  tags: Record<string, string>;
}

export interface DataSource {
  type: "file" | "redshift" | "bigquery" | "snowflake" | "kafka";
  name: string;
  path?: string;
  table?: string;
  eventTimestampColumn?: string;
}

export interface Entity {
  name: string;
  description?: string;
  valueType: string;
  joinKeys: string[];
  tags: Record<string, string>;
}

export interface FeatureValue {
  featureName: string;
  value: any;
  eventTimestamp: string;
  createdTimestamp: string;
}

export interface OnlineFeatureResponse {
  entityKey: Record<string, any>;
  features: FeatureValue[];
  metadata: {
    featureViewName: string;
    latencyMs: number;
  };
}

export interface FeatureFreshness {
  featureViewName: string;
  lastMaterializedAt: string;
  staleness: string;
  isStale: boolean;
  recordCount: number;
}

export interface FeatureStoreStats {
  projectName: string;
  featureViews: number;
  entities: number;
  onlineStoreType: string;
  offlineStoreType: string;
  totalFeatures: number;
  lastMaterialization: string;
}

export class FeastClient {
  private client: AxiosInstance;
  private projectName: string;
  private useMockData: boolean;

  constructor(config: FeastConfig) {
    this.client = axios.create({
      baseURL: config.baseUrl,
      timeout: 10000,
    });
    this.projectName = config.projectName || "molecare";
    this.useMockData = process.env.NODE_ENV !== "production";
  }

  // ===========================================================================
  // Feature Views
  // ===========================================================================

  /**
   * List all feature views
   */
  async listFeatureViews(): Promise<FeatureView[]> {
    if (this.useMockData) {
      return this.getMockFeatureViews();
    }

    try {
      const response = await this.client.get("/feature-views");
      return response.data.feature_views || [];
    } catch (error) {
      console.error("Feast API error:", error);
      return this.getMockFeatureViews();
    }
  }

  /**
   * Get feature view by name
   */
  async getFeatureView(name: string): Promise<FeatureView | null> {
    if (this.useMockData) {
      return this.getMockFeatureViews().find((fv) => fv.name === name) || null;
    }

    try {
      const response = await this.client.get(`/feature-views/${name}`);
      return response.data;
    } catch (error) {
      console.error("Feast API error:", error);
      return null;
    }
  }

  // ===========================================================================
  // Entities
  // ===========================================================================

  /**
   * List all entities
   */
  async listEntities(): Promise<Entity[]> {
    if (this.useMockData) {
      return this.getMockEntities();
    }

    try {
      const response = await this.client.get("/entities");
      return response.data.entities || [];
    } catch (error) {
      console.error("Feast API error:", error);
      return this.getMockEntities();
    }
  }

  /**
   * Get entity by name
   */
  async getEntity(name: string): Promise<Entity | null> {
    if (this.useMockData) {
      return this.getMockEntities().find((e) => e.name === name) || null;
    }

    try {
      const response = await this.client.get(`/entities/${name}`);
      return response.data;
    } catch (error) {
      console.error("Feast API error:", error);
      return null;
    }
  }

  // ===========================================================================
  // Online Features
  // ===========================================================================

  /**
   * Get online features for an entity
   */
  async getOnlineFeatures(
    featureViewName: string,
    entityKey: Record<string, any>,
    featureNames?: string[]
  ): Promise<OnlineFeatureResponse> {
    if (this.useMockData) {
      return this.getMockOnlineFeatures(featureViewName, entityKey);
    }

    try {
      const response = await this.client.post("/get-online-features", {
        feature_view: featureViewName,
        entity_key: entityKey,
        features: featureNames,
      });
      return response.data;
    } catch (error) {
      console.error("Feast API error:", error);
      return this.getMockOnlineFeatures(featureViewName, entityKey);
    }
  }

  // ===========================================================================
  // Feature Freshness
  // ===========================================================================

  /**
   * Get feature freshness status
   */
  async getFeatureFreshness(): Promise<FeatureFreshness[]> {
    if (this.useMockData) {
      return this.getMockFeatureFreshness();
    }

    try {
      const response = await this.client.get("/feature-freshness");
      return response.data.freshness || [];
    } catch (error) {
      console.error("Feast API error:", error);
      return this.getMockFeatureFreshness();
    }
  }

  // ===========================================================================
  // Store Stats
  // ===========================================================================

  /**
   * Get feature store statistics
   */
  async getStoreStats(): Promise<FeatureStoreStats> {
    if (this.useMockData) {
      return this.getMockStoreStats();
    }

    try {
      const response = await this.client.get("/stats");
      return response.data;
    } catch (error) {
      console.error("Feast API error:", error);
      return this.getMockStoreStats();
    }
  }

  // ===========================================================================
  // Mock Data
  // ===========================================================================

  private getMockFeatureViews(): FeatureView[] {
    const now = new Date().toISOString();
    return [
      {
        name: "user_features",
        description: "User-level features for skin analysis",
        entities: ["user_id"],
        features: [
          { name: "skin_type", dtype: "INT32", description: "Fitzpatrick skin type (1-6)", tags: {} },
          { name: "has_family_history", dtype: "BOOL", description: "Family history of skin cancer", tags: {} },
          { name: "total_moles_count", dtype: "INT32", description: "Total moles tracked", tags: {} },
          { name: "high_risk_moles_count", dtype: "INT32", description: "Number of high-risk moles", tags: {} },
          { name: "average_risk_score", dtype: "FLOAT", description: "Average risk score across moles", tags: {} },
          { name: "last_analysis_days_ago", dtype: "INT32", description: "Days since last analysis", tags: {} },
        ],
        source: {
          type: "redshift",
          name: "user_features_source",
          table: "ml_features.user_features",
          eventTimestampColumn: "event_timestamp",
        },
        ttl: "7d",
        tags: { team: "ml-platform", domain: "user" },
        createdAt: new Date(Date.now() - 86400000 * 60).toISOString(),
        lastUpdatedAt: now,
      },
      {
        name: "mole_features",
        description: "Mole-level features for ML models",
        entities: ["mole_id"],
        features: [
          { name: "asymmetry_score", dtype: "FLOAT", description: "Asymmetry analysis score", tags: {} },
          { name: "border_score", dtype: "FLOAT", description: "Border irregularity score", tags: {} },
          { name: "color_score", dtype: "FLOAT", description: "Color variation score", tags: {} },
          { name: "diameter_mm", dtype: "FLOAT", description: "Diameter in millimeters", tags: {} },
          { name: "evolution_score", dtype: "FLOAT", description: "Evolution/change score", tags: {} },
          { name: "image_count", dtype: "INT32", description: "Number of images captured", tags: {} },
          { name: "days_tracked", dtype: "INT32", description: "Days since first image", tags: {} },
        ],
        source: {
          type: "redshift",
          name: "mole_features_source",
          table: "ml_features.mole_features",
          eventTimestampColumn: "event_timestamp",
        },
        ttl: "1d",
        tags: { team: "ml-platform", domain: "mole" },
        createdAt: new Date(Date.now() - 86400000 * 45).toISOString(),
        lastUpdatedAt: now,
      },
      {
        name: "analysis_features",
        description: "Analysis session features",
        entities: ["analysis_id"],
        features: [
          { name: "overall_risk_score", dtype: "FLOAT", description: "Combined risk score", tags: {} },
          { name: "confidence", dtype: "FLOAT", description: "Model confidence", tags: {} },
          { name: "processing_time_ms", dtype: "INT32", description: "Processing time", tags: {} },
          { name: "model_version", dtype: "STRING", description: "Model version used", tags: {} },
          { name: "abcde_flags_count", dtype: "INT32", description: "Number of ABCDE flags", tags: {} },
        ],
        source: {
          type: "redshift",
          name: "analysis_features_source",
          table: "ml_features.analysis_features",
          eventTimestampColumn: "event_timestamp",
        },
        ttl: "30d",
        tags: { team: "ml-platform", domain: "analysis" },
        createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
        lastUpdatedAt: now,
      },
      {
        name: "image_embeddings",
        description: "Image embedding vectors for similarity search",
        entities: ["image_id"],
        features: [
          { name: "embedding_vector", dtype: "FLOAT_LIST", description: "512-dim embedding vector", tags: {} },
          { name: "model_type", dtype: "STRING", description: "Embedding model used", tags: {} },
        ],
        source: {
          type: "file",
          name: "embeddings_parquet",
          path: "s3://molecare-features/embeddings/",
          eventTimestampColumn: "created_at",
        },
        ttl: "90d",
        tags: { team: "ml-platform", domain: "embedding" },
        createdAt: new Date(Date.now() - 86400000 * 20).toISOString(),
        lastUpdatedAt: now,
      },
    ];
  }

  private getMockEntities(): Entity[] {
    return [
      {
        name: "user_id",
        description: "Unique user identifier",
        valueType: "STRING",
        joinKeys: ["user_id"],
        tags: { domain: "user" },
      },
      {
        name: "mole_id",
        description: "Unique mole identifier",
        valueType: "STRING",
        joinKeys: ["mole_id"],
        tags: { domain: "mole" },
      },
      {
        name: "analysis_id",
        description: "Unique analysis session identifier",
        valueType: "STRING",
        joinKeys: ["analysis_id"],
        tags: { domain: "analysis" },
      },
      {
        name: "image_id",
        description: "Unique image identifier",
        valueType: "STRING",
        joinKeys: ["image_id"],
        tags: { domain: "image" },
      },
    ];
  }

  private getMockOnlineFeatures(
    featureViewName: string,
    entityKey: Record<string, any>
  ): OnlineFeatureResponse {
    const now = new Date().toISOString();

    if (featureViewName === "user_features") {
      return {
        entityKey,
        features: [
          { featureName: "skin_type", value: 2, eventTimestamp: now, createdTimestamp: now },
          { featureName: "has_family_history", value: false, eventTimestamp: now, createdTimestamp: now },
          { featureName: "total_moles_count", value: 5, eventTimestamp: now, createdTimestamp: now },
          { featureName: "high_risk_moles_count", value: 1, eventTimestamp: now, createdTimestamp: now },
          { featureName: "average_risk_score", value: 0.32, eventTimestamp: now, createdTimestamp: now },
          { featureName: "last_analysis_days_ago", value: 3, eventTimestamp: now, createdTimestamp: now },
        ],
        metadata: { featureViewName, latencyMs: 2 },
      };
    }

    if (featureViewName === "mole_features") {
      return {
        entityKey,
        features: [
          { featureName: "asymmetry_score", value: 0.25, eventTimestamp: now, createdTimestamp: now },
          { featureName: "border_score", value: 0.18, eventTimestamp: now, createdTimestamp: now },
          { featureName: "color_score", value: 0.32, eventTimestamp: now, createdTimestamp: now },
          { featureName: "diameter_mm", value: 4.5, eventTimestamp: now, createdTimestamp: now },
          { featureName: "evolution_score", value: 0.12, eventTimestamp: now, createdTimestamp: now },
          { featureName: "image_count", value: 8, eventTimestamp: now, createdTimestamp: now },
          { featureName: "days_tracked", value: 180, eventTimestamp: now, createdTimestamp: now },
        ],
        metadata: { featureViewName, latencyMs: 1 },
      };
    }

    return {
      entityKey,
      features: [],
      metadata: { featureViewName, latencyMs: 1 },
    };
  }

  private getMockFeatureFreshness(): FeatureFreshness[] {
    const now = Date.now();
    return [
      {
        featureViewName: "user_features",
        lastMaterializedAt: new Date(now - 3600000).toISOString(),
        staleness: "1h 0m",
        isStale: false,
        recordCount: 15420,
      },
      {
        featureViewName: "mole_features",
        lastMaterializedAt: new Date(now - 7200000).toISOString(),
        staleness: "2h 0m",
        isStale: false,
        recordCount: 48650,
      },
      {
        featureViewName: "analysis_features",
        lastMaterializedAt: new Date(now - 86400000).toISOString(),
        staleness: "1d 0h",
        isStale: false,
        recordCount: 125000,
      },
      {
        featureViewName: "image_embeddings",
        lastMaterializedAt: new Date(now - 172800000).toISOString(),
        staleness: "2d 0h",
        isStale: false,
        recordCount: 250000,
      },
    ];
  }

  private getMockStoreStats(): FeatureStoreStats {
    return {
      projectName: this.projectName,
      featureViews: 4,
      entities: 4,
      onlineStoreType: "redis",
      offlineStoreType: "redshift",
      totalFeatures: 22,
      lastMaterialization: new Date(Date.now() - 3600000).toISOString(),
    };
  }
}
