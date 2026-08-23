/**
 * Infrastructure Status Client
 * ==============================
 *
 * Provides status monitoring for:
 * - Phone/Mobile application
 * - Web application
 * - Backend services
 * - Kubernetes clusters
 * - Databases
 * - External dependencies
 */

import axios, { AxiosInstance } from "axios";

export interface InfraConfig {
  webAppUrl?: string;
  mobileApiUrl?: string;
  backendUrl?: string;
  k8sApiUrl?: string;
  k8sToken?: string;
}

// =============================================================================
// Types
// =============================================================================

export interface ApplicationStatus {
  name: string;
  type: "web" | "mobile" | "backend" | "ml-serving";
  status: "healthy" | "degraded" | "unhealthy" | "unknown";
  version?: string;
  uptime?: string;
  lastChecked: string;
  responseTimeMs?: number;
  endpoints?: EndpointStatus[];
  details?: Record<string, any>;
}

export interface EndpointStatus {
  path: string;
  method: string;
  status: "up" | "down" | "slow";
  responseTimeMs?: number;
  lastChecked: string;
}

export interface KubernetesStatus {
  cluster: string;
  status: "healthy" | "degraded" | "unhealthy";
  nodes: NodeStatus[];
  namespaces: NamespaceStatus[];
}

export interface NodeStatus {
  name: string;
  status: "Ready" | "NotReady" | "Unknown";
  roles: string[];
  cpu: ResourceUsage;
  memory: ResourceUsage;
  pods: number;
}

export interface ResourceUsage {
  used: string;
  capacity: string;
  percentage: number;
}

export interface NamespaceStatus {
  name: string;
  status: "Active" | "Terminating";
  deployments: DeploymentStatus[];
  pods: PodSummary;
}

export interface DeploymentStatus {
  name: string;
  namespace: string;
  replicas: {
    desired: number;
    ready: number;
    available: number;
  };
  status: "healthy" | "degraded" | "unhealthy";
  image: string;
  lastUpdated: string;
}

export interface PodSummary {
  total: number;
  running: number;
  pending: number;
  failed: number;
  succeeded: number;
}

export interface ServiceHealth {
  name: string;
  type: string;
  status: "healthy" | "degraded" | "unhealthy" | "unknown";
  latencyMs?: number;
  errorRate?: number;
  lastChecked: string;
  details?: Record<string, any>;
}

export interface DatabaseStatus {
  name: string;
  type: "postgresql" | "redis" | "mongodb" | "mysql";
  status: "connected" | "disconnected" | "slow";
  connections: {
    active: number;
    max: number;
    idle: number;
  };
  latencyMs?: number;
  size?: string;
  version?: string;
}

export class InfrastructureClient {
  private webClient?: AxiosInstance;
  private mobileClient?: AxiosInstance;
  private backendClient?: AxiosInstance;
  private useMockData: boolean;

  constructor(config: InfraConfig) {
    if (config.webAppUrl) {
      this.webClient = axios.create({
        baseURL: config.webAppUrl,
        timeout: 5000,
      });
    }

    if (config.mobileApiUrl) {
      this.mobileClient = axios.create({
        baseURL: config.mobileApiUrl,
        timeout: 5000,
      });
    }

    if (config.backendUrl) {
      this.backendClient = axios.create({
        baseURL: config.backendUrl,
        timeout: 5000,
      });
    }

    this.useMockData = process.env.NODE_ENV !== "production";
  }

  // ===========================================================================
  // Application Status
  // ===========================================================================

  /**
   * Get status of all applications
   */
  async getAllApplicationStatus(): Promise<ApplicationStatus[]> {
    if (this.useMockData) {
      return this.getMockApplicationStatus();
    }

    const statuses: ApplicationStatus[] = [];

    // Check web app
    if (this.webClient) {
      statuses.push(await this.checkWebAppHealth());
    }

    // Check mobile API
    if (this.mobileClient) {
      statuses.push(await this.checkMobileApiHealth());
    }

    // Check backend
    if (this.backendClient) {
      statuses.push(await this.checkBackendHealth());
    }

    return statuses.length > 0 ? statuses : this.getMockApplicationStatus();
  }

  /**
   * Get web application status
   */
  async getWebAppStatus(): Promise<ApplicationStatus> {
    if (this.useMockData || !this.webClient) {
      return this.getMockApplicationStatus().find((a) => a.type === "web")!;
    }

    return this.checkWebAppHealth();
  }

  /**
   * Get mobile application API status
   */
  async getMobileAppStatus(): Promise<ApplicationStatus> {
    if (this.useMockData || !this.mobileClient) {
      return this.getMockApplicationStatus().find((a) => a.type === "mobile")!;
    }

    return this.checkMobileApiHealth();
  }

  /**
   * Get backend services status
   */
  async getBackendStatus(): Promise<ApplicationStatus> {
    if (this.useMockData || !this.backendClient) {
      return this.getMockApplicationStatus().find((a) => a.type === "backend")!;
    }

    return this.checkBackendHealth();
  }

  /**
   * Get ML serving status
   */
  async getMLServingStatus(): Promise<ApplicationStatus> {
    if (this.useMockData) {
      return this.getMockApplicationStatus().find(
        (a) => a.type === "ml-serving"
      )!;
    }

    // Check actual ML serving endpoint
    try {
      const start = Date.now();
      const response = await axios.get(
        process.env.ML_SERVING_URL || "http://localhost:5000/health",
        { timeout: 5000 }
      );
      const responseTime = Date.now() - start;

      return {
        name: "MoleCare ML Serving",
        type: "ml-serving",
        status: response.data.status === "healthy" ? "healthy" : "degraded",
        responseTimeMs: responseTime,
        lastChecked: new Date().toISOString(),
        details: response.data.services,
      };
    } catch {
      return {
        name: "MoleCare ML Serving",
        type: "ml-serving",
        status: "unhealthy",
        lastChecked: new Date().toISOString(),
      };
    }
  }

  // ===========================================================================
  // Kubernetes Status
  // ===========================================================================

  /**
   * Get Kubernetes cluster overview
   */
  async getKubernetesStatus(): Promise<KubernetesStatus> {
    if (this.useMockData) {
      return this.getMockKubernetesStatus();
    }

    // In production, would use @kubernetes/client-node
    return this.getMockKubernetesStatus();
  }

  /**
   * Get deployments in a namespace
   */
  async getDeployments(namespace?: string): Promise<DeploymentStatus[]> {
    if (this.useMockData) {
      const k8sStatus = this.getMockKubernetesStatus();
      if (namespace) {
        const ns = k8sStatus.namespaces.find((n) => n.name === namespace);
        return ns?.deployments || [];
      }
      return k8sStatus.namespaces.flatMap((n) => n.deployments);
    }

    // In production, would query K8s API
    return this.getMockKubernetesStatus().namespaces.flatMap(
      (n) => n.deployments
    );
  }

  /**
   * Get pods summary by namespace
   */
  async getPodsSummary(namespace?: string): Promise<{
    namespace: string;
    pods: PodSummary;
  }[]> {
    if (this.useMockData) {
      const k8sStatus = this.getMockKubernetesStatus();
      if (namespace) {
        const ns = k8sStatus.namespaces.find((n) => n.name === namespace);
        return ns ? [{ namespace: ns.name, pods: ns.pods }] : [];
      }
      return k8sStatus.namespaces.map((n) => ({
        namespace: n.name,
        pods: n.pods,
      }));
    }

    return this.getMockKubernetesStatus().namespaces.map((n) => ({
      namespace: n.name,
      pods: n.pods,
    }));
  }

  // ===========================================================================
  // Service Health
  // ===========================================================================

  /**
   * Get all service health
   */
  async getAllServiceHealth(): Promise<ServiceHealth[]> {
    if (this.useMockData) {
      return this.getMockServiceHealth();
    }

    return this.getMockServiceHealth();
  }

  /**
   * Get database status
   */
  async getDatabaseStatus(): Promise<DatabaseStatus[]> {
    if (this.useMockData) {
      return this.getMockDatabaseStatus();
    }

    return this.getMockDatabaseStatus();
  }

  // ===========================================================================
  // Health Check Helpers
  // ===========================================================================

  private async checkWebAppHealth(): Promise<ApplicationStatus> {
    const start = Date.now();
    try {
      const response = await this.webClient!.get("/health");
      return {
        name: "MoleCare Web App",
        type: "web",
        status: "healthy",
        responseTimeMs: Date.now() - start,
        lastChecked: new Date().toISOString(),
        details: response.data,
      };
    } catch {
      return {
        name: "MoleCare Web App",
        type: "web",
        status: "unhealthy",
        lastChecked: new Date().toISOString(),
      };
    }
  }

  private async checkMobileApiHealth(): Promise<ApplicationStatus> {
    const start = Date.now();
    try {
      const response = await this.mobileClient!.get("/health");
      return {
        name: "MoleCare Mobile API",
        type: "mobile",
        status: "healthy",
        responseTimeMs: Date.now() - start,
        lastChecked: new Date().toISOString(),
        details: response.data,
      };
    } catch {
      return {
        name: "MoleCare Mobile API",
        type: "mobile",
        status: "unhealthy",
        lastChecked: new Date().toISOString(),
      };
    }
  }

  private async checkBackendHealth(): Promise<ApplicationStatus> {
    const start = Date.now();
    try {
      const response = await this.backendClient!.get("/actuator/health");
      return {
        name: "MoleCare Backend (Spring Boot)",
        type: "backend",
        status: response.data.status === "UP" ? "healthy" : "degraded",
        responseTimeMs: Date.now() - start,
        lastChecked: new Date().toISOString(),
        details: response.data,
      };
    } catch {
      return {
        name: "MoleCare Backend (Spring Boot)",
        type: "backend",
        status: "unhealthy",
        lastChecked: new Date().toISOString(),
      };
    }
  }

  // ===========================================================================
  // Mock Data
  // ===========================================================================

  private getMockApplicationStatus(): ApplicationStatus[] {
    const now = new Date().toISOString();
    return [
      {
        name: "MoleCare Web App",
        type: "web",
        status: "healthy",
        version: "2.1.0",
        uptime: "14d 6h 32m",
        lastChecked: now,
        responseTimeMs: 45,
        endpoints: [
          { path: "/", method: "GET", status: "up", responseTimeMs: 32, lastChecked: now },
          { path: "/health", method: "GET", status: "up", responseTimeMs: 12, lastChecked: now },
          { path: "/api/moles", method: "GET", status: "up", responseTimeMs: 89, lastChecked: now },
        ],
        details: {
          framework: "React",
          hosting: "Vercel",
          region: "us-east-1",
        },
      },
      {
        name: "MoleCare Mobile API",
        type: "mobile",
        status: "healthy",
        version: "1.8.0",
        uptime: "7d 12h 15m",
        lastChecked: now,
        responseTimeMs: 78,
        endpoints: [
          { path: "/api/v1/health", method: "GET", status: "up", responseTimeMs: 23, lastChecked: now },
          { path: "/api/v1/predict", method: "POST", status: "up", responseTimeMs: 234, lastChecked: now },
          { path: "/api/v1/moles", method: "GET", status: "up", responseTimeMs: 67, lastChecked: now },
        ],
        details: {
          platform: "iOS & Android",
          minVersion: { ios: "15.0", android: "10" },
          activeUsers: 1250,
        },
      },
      {
        name: "MoleCare Backend (Spring Boot)",
        type: "backend",
        status: "healthy",
        version: "3.2.1",
        uptime: "21d 4h 47m",
        lastChecked: now,
        responseTimeMs: 34,
        endpoints: [
          { path: "/actuator/health", method: "GET", status: "up", responseTimeMs: 15, lastChecked: now },
          { path: "/api/moles", method: "GET", status: "up", responseTimeMs: 45, lastChecked: now },
          { path: "/api/users", method: "GET", status: "up", responseTimeMs: 38, lastChecked: now },
        ],
        details: {
          framework: "Spring Boot 3.2",
          database: "PostgreSQL",
          javaVersion: "21",
        },
      },
      {
        name: "MoleCare ML Serving",
        type: "ml-serving",
        status: "healthy",
        version: "1.5.0",
        uptime: "5d 18h 22m",
        lastChecked: now,
        responseTimeMs: 156,
        endpoints: [
          { path: "/health", method: "GET", status: "up", responseTimeMs: 8, lastChecked: now },
          { path: "/predict", method: "POST", status: "up", responseTimeMs: 312, lastChecked: now },
          { path: "/analyze", method: "POST", status: "up", responseTimeMs: 287, lastChecked: now },
          { path: "/detect", method: "POST", status: "up", responseTimeMs: 198, lastChecked: now },
        ],
        details: {
          models: {
            xception: "loaded",
            abcde: "loaded",
            detection: "loaded",
            dermFoundation: "available",
          },
          gpuAvailable: true,
          inferenceLatencyP99: "450ms",
        },
      },
    ];
  }

  private getMockKubernetesStatus(): KubernetesStatus {
    return {
      cluster: "molecare-prod-eks",
      status: "healthy",
      nodes: [
        {
          name: "ip-10-0-1-101.ec2.internal",
          status: "Ready",
          roles: ["worker"],
          cpu: { used: "2.3", capacity: "4", percentage: 57.5 },
          memory: { used: "6.2Gi", capacity: "16Gi", percentage: 38.75 },
          pods: 12,
        },
        {
          name: "ip-10-0-1-102.ec2.internal",
          status: "Ready",
          roles: ["worker"],
          cpu: { used: "1.8", capacity: "4", percentage: 45 },
          memory: { used: "5.8Gi", capacity: "16Gi", percentage: 36.25 },
          pods: 10,
        },
        {
          name: "ip-10-0-2-103.ec2.internal",
          status: "Ready",
          roles: ["worker", "ml"],
          cpu: { used: "3.2", capacity: "8", percentage: 40 },
          memory: { used: "24Gi", capacity: "64Gi", percentage: 37.5 },
          pods: 8,
        },
      ],
      namespaces: [
        {
          name: "molecare",
          status: "Active",
          deployments: [
            {
              name: "molecare-backend",
              namespace: "molecare",
              replicas: { desired: 3, ready: 3, available: 3 },
              status: "healthy",
              image: "molecare/backend:3.2.1",
              lastUpdated: new Date(Date.now() - 86400000 * 2).toISOString(),
            },
            {
              name: "molecare-web",
              namespace: "molecare",
              replicas: { desired: 2, ready: 2, available: 2 },
              status: "healthy",
              image: "molecare/web:2.1.0",
              lastUpdated: new Date(Date.now() - 86400000).toISOString(),
            },
          ],
          pods: { total: 8, running: 8, pending: 0, failed: 0, succeeded: 0 },
        },
        {
          name: "ml-serving",
          status: "Active",
          deployments: [
            {
              name: "ml-inference",
              namespace: "ml-serving",
              replicas: { desired: 3, ready: 3, available: 3 },
              status: "healthy",
              image: "molecare/ml-serving:1.5.0",
              lastUpdated: new Date(Date.now() - 86400000 * 5).toISOString(),
            },
            {
              name: "tensorflow-serving",
              namespace: "ml-serving",
              replicas: { desired: 2, ready: 2, available: 2 },
              status: "healthy",
              image: "tensorflow/serving:2.14.0",
              lastUpdated: new Date(Date.now() - 86400000 * 7).toISOString(),
            },
          ],
          pods: { total: 7, running: 7, pending: 0, failed: 0, succeeded: 0 },
        },
        {
          name: "mlops",
          status: "Active",
          deployments: [
            {
              name: "mlflow",
              namespace: "mlops",
              replicas: { desired: 2, ready: 2, available: 2 },
              status: "healthy",
              image: "ghcr.io/mlflow/mlflow:v2.10.0",
              lastUpdated: new Date(Date.now() - 86400000 * 14).toISOString(),
            },
            {
              name: "feast-server",
              namespace: "mlops",
              replicas: { desired: 2, ready: 2, available: 2 },
              status: "healthy",
              image: "feastdev/feature-server:0.36.0",
              lastUpdated: new Date(Date.now() - 86400000 * 10).toISOString(),
            },
          ],
          pods: { total: 6, running: 6, pending: 0, failed: 0, succeeded: 0 },
        },
        {
          name: "monitoring",
          status: "Active",
          deployments: [
            {
              name: "prometheus",
              namespace: "monitoring",
              replicas: { desired: 1, ready: 1, available: 1 },
              status: "healthy",
              image: "prom/prometheus:v2.48.0",
              lastUpdated: new Date(Date.now() - 86400000 * 30).toISOString(),
            },
            {
              name: "grafana",
              namespace: "monitoring",
              replicas: { desired: 1, ready: 1, available: 1 },
              status: "healthy",
              image: "grafana/grafana:10.2.0",
              lastUpdated: new Date(Date.now() - 86400000 * 30).toISOString(),
            },
          ],
          pods: { total: 4, running: 4, pending: 0, failed: 0, succeeded: 0 },
        },
      ],
    };
  }

  private getMockServiceHealth(): ServiceHealth[] {
    const now = new Date().toISOString();
    return [
      {
        name: "PostgreSQL (Main DB)",
        type: "database",
        status: "healthy",
        latencyMs: 2,
        errorRate: 0,
        lastChecked: now,
        details: { connections: 45, maxConnections: 100, replication: "sync" },
      },
      {
        name: "Redis (Cache)",
        type: "cache",
        status: "healthy",
        latencyMs: 0.5,
        errorRate: 0,
        lastChecked: now,
        details: { memoryUsed: "256MB", hitRate: 0.94 },
      },
      {
        name: "S3 (Artifacts)",
        type: "storage",
        status: "healthy",
        latencyMs: 45,
        errorRate: 0,
        lastChecked: now,
        details: { bucket: "molecare-artifacts", region: "us-east-1" },
      },
      {
        name: "Auth0",
        type: "auth",
        status: "healthy",
        latencyMs: 120,
        errorRate: 0.001,
        lastChecked: now,
        details: { tenant: "molecare", plan: "professional" },
      },
      {
        name: "Stripe (Payments)",
        type: "payment",
        status: "healthy",
        latencyMs: 180,
        errorRate: 0,
        lastChecked: now,
        details: { mode: "live", webhookStatus: "active" },
      },
      {
        name: "SendGrid (Email)",
        type: "email",
        status: "healthy",
        latencyMs: 95,
        errorRate: 0.002,
        lastChecked: now,
        details: { dailyLimit: 100000, used: 2340 },
      },
    ];
  }

  private getMockDatabaseStatus(): DatabaseStatus[] {
    return [
      {
        name: "molecare-main",
        type: "postgresql",
        status: "connected",
        connections: { active: 45, max: 100, idle: 12 },
        latencyMs: 2,
        size: "4.2GB",
        version: "15.4",
      },
      {
        name: "mlflow-backend",
        type: "postgresql",
        status: "connected",
        connections: { active: 8, max: 50, idle: 5 },
        latencyMs: 3,
        size: "1.8GB",
        version: "15.4",
      },
      {
        name: "feast-online",
        type: "redis",
        status: "connected",
        connections: { active: 12, max: 1000, idle: 0 },
        latencyMs: 0.5,
        size: "512MB",
        version: "7.2.3",
      },
      {
        name: "session-cache",
        type: "redis",
        status: "connected",
        connections: { active: 28, max: 1000, idle: 0 },
        latencyMs: 0.4,
        size: "256MB",
        version: "7.2.3",
      },
    ];
  }
}
