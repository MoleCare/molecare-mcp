/**
 * Health check utilities for MCP server
 * Monitors connectivity to all backend services
 */

import { logger } from "./logger.js";

export interface ServiceHealth {
  name: string;
  status: "healthy" | "unhealthy" | "degraded";
  latencyMs?: number;
  lastCheck: string;
  error?: string;
}

export interface OverallHealth {
  status: "healthy" | "degraded" | "unhealthy";
  uptime: number;
  services: ServiceHealth[];
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
  };
}

const startTime = Date.now();

/**
 * Check if a service is reachable
 */
async function checkService(
  name: string,
  checkFn: () => Promise<boolean>
): Promise<ServiceHealth> {
  const start = Date.now();

  try {
    const success = await checkFn();
    const latencyMs = Date.now() - start;

    return {
      name,
      status: success ? "healthy" : "degraded",
      latencyMs,
      lastCheck: new Date().toISOString(),
    };
  } catch (error) {
    return {
      name,
      status: "unhealthy",
      lastCheck: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Perform comprehensive health check
 */
export async function performHealthCheck(
  clients: {
    mlflow?: { listExperiments: () => Promise<any> };
    infra?: { getAllApplicationStatus: () => Promise<any> };
    cicd?: { getWorkflowRuns: () => Promise<any> };
    feast?: { listFeatureViews: () => Promise<any> };
    api?: { getUserMoles: (id: string) => Promise<any> };
  }
): Promise<OverallHealth> {
  const checks: Promise<ServiceHealth>[] = [];

  if (clients.mlflow) {
    checks.push(
      checkService("MLflow", async () => {
        const result = await clients.mlflow!.listExperiments();
        return Array.isArray(result);
      })
    );
  }

  if (clients.infra) {
    checks.push(
      checkService("Infrastructure", async () => {
        const result = await clients.infra!.getAllApplicationStatus();
        return Array.isArray(result);
      })
    );
  }

  if (clients.cicd) {
    checks.push(
      checkService("CI/CD", async () => {
        const result = await clients.cicd!.getWorkflowRuns();
        return Array.isArray(result);
      })
    );
  }

  if (clients.feast) {
    checks.push(
      checkService("Feast", async () => {
        const result = await clients.feast!.listFeatureViews();
        return Array.isArray(result);
      })
    );
  }

  if (clients.api) {
    checks.push(
      checkService("MoleCare API", async () => {
        // Use a test user ID
        await clients.api!.getUserMoles("test");
        return true;
      })
    );
  }

  const services = await Promise.all(checks);

  const summary = {
    total: services.length,
    healthy: services.filter((s) => s.status === "healthy").length,
    degraded: services.filter((s) => s.status === "degraded").length,
    unhealthy: services.filter((s) => s.status === "unhealthy").length,
  };

  let status: "healthy" | "degraded" | "unhealthy";
  if (summary.unhealthy === summary.total) {
    status = "unhealthy";
  } else if (summary.healthy === summary.total) {
    status = "healthy";
  } else {
    status = "degraded";
  }

  const health: OverallHealth = {
    status,
    uptime: Date.now() - startTime,
    services,
    summary,
  };

  logger.info("Health check completed", {
    status: health.status,
    summary: health.summary,
  });

  return health;
}

/**
 * Format uptime as human-readable string
 */
export function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}
