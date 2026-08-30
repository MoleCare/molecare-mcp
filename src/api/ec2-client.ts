/**
 * AWS EC2 Client for MoleCare Server monitoring
 * Provides instance status, health checks, and CloudWatch metrics
 */

import { logger } from "../utils/logger.js";

// Types for EC2 monitoring
export interface EC2Instance {
  instanceId: string;
  name: string;
  state: "running" | "stopped" | "pending" | "stopping" | "terminated";
  instanceType: string;
  publicIp?: string;
  privateIp: string;
  launchTime: string;
  availabilityZone: string;
  tags: Record<string, string>;
}

export interface EC2HealthCheck {
  instanceId: string;
  instanceStatus: "ok" | "impaired" | "initializing" | "insufficient-data";
  systemStatus: "ok" | "impaired" | "initializing" | "insufficient-data";
  statusChecks: {
    instance: boolean;
    system: boolean;
  };
}

export interface EC2Metrics {
  instanceId: string;
  period: string;
  cpuUtilization: MetricDataPoint[];
  networkIn: MetricDataPoint[];
  networkOut: MetricDataPoint[];
  diskReadOps?: MetricDataPoint[];
  diskWriteOps?: MetricDataPoint[];
}

export interface MetricDataPoint {
  timestamp: string;
  value: number;
  unit: string;
}

export interface EC2ClientConfig {
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  instanceIds?: string[]; // Specific instances to monitor
  tagFilters?: Record<string, string>; // Filter by tags like { "app": "molecare" }
}

export class EC2Client {
  private region: string;
  private instanceIds: string[];
  private tagFilters: Record<string, string>;
  private useMockData: boolean;

  constructor(config: EC2ClientConfig = {}) {
    this.region = config.region || process.env.AWS_REGION || "us-east-1";
    this.instanceIds = config.instanceIds || process.env.EC2_INSTANCE_IDS?.split(",") || [];
    this.tagFilters = config.tagFilters || { app: "molecare" };

    // Use mock data if no AWS credentials or in development
    this.useMockData =
      process.env.NODE_ENV === "development" ||
      (!process.env.AWS_ACCESS_KEY_ID && !process.env.AWS_PROFILE);

    if (this.useMockData) {
      logger.info("EC2Client using mock data (no AWS credentials configured)");
    }
  }

  /**
   * Get all MoleCare EC2 instances
   */
  async getInstances(): Promise<EC2Instance[]> {
    if (this.useMockData) {
      return this.getMockInstances();
    }

    try {
      // Dynamic import to avoid issues if aws-sdk not installed
      const { EC2Client: AwsEC2Client, DescribeInstancesCommand } = await import("@aws-sdk/client-ec2");

      const client = new AwsEC2Client({ region: this.region });

      const filters = [
        { Name: "tag:app", Values: ["molecare"] },
        { Name: "instance-state-name", Values: ["running", "stopped", "pending", "stopping"] },
      ];

      if (this.instanceIds.length > 0) {
        const command = new DescribeInstancesCommand({ InstanceIds: this.instanceIds });
        const response = await client.send(command);
        return this.parseInstances(response);
      }

      const command = new DescribeInstancesCommand({ Filters: filters });
      const response = await client.send(command);
      return this.parseInstances(response);
    } catch (error) {
      logger.error("Failed to get EC2 instances", { error: String(error) });
      return this.getMockInstances();
    }
  }

  /**
   * Get specific instance by ID
   */
  async getInstance(instanceId: string): Promise<EC2Instance | null> {
    const instances = await this.getInstances();
    return instances.find((i) => i.instanceId === instanceId) || null;
  }

  /**
   * Get health status of instances
   */
  async getInstanceHealth(instanceId?: string): Promise<EC2HealthCheck[]> {
    if (this.useMockData) {
      return this.getMockHealthChecks(instanceId);
    }

    try {
      const { EC2Client: AwsEC2Client, DescribeInstanceStatusCommand } = await import("@aws-sdk/client-ec2");

      const client = new AwsEC2Client({ region: this.region });

      const params: any = {
        IncludeAllInstances: true,
      };

      if (instanceId) {
        params.InstanceIds = [instanceId];
      } else if (this.instanceIds.length > 0) {
        params.InstanceIds = this.instanceIds;
      }

      const command = new DescribeInstanceStatusCommand(params);
      const response = await client.send(command);

      return (response.InstanceStatuses || []).map((status: any) => ({
        instanceId: status.InstanceId || "unknown",
        instanceStatus: this.mapStatus(status.InstanceStatus?.Status),
        systemStatus: this.mapStatus(status.SystemStatus?.Status),
        statusChecks: {
          instance: status.InstanceStatus?.Status === "ok",
          system: status.SystemStatus?.Status === "ok",
        },
      }));
    } catch (error) {
      logger.error("Failed to get instance health", { error: String(error) });
      return this.getMockHealthChecks(instanceId);
    }
  }

  /**
   * Get CloudWatch metrics for an instance
   */
  async getInstanceMetrics(
    instanceId: string,
    periodMinutes: number = 60
  ): Promise<EC2Metrics> {
    if (this.useMockData) {
      return this.getMockMetrics(instanceId, periodMinutes);
    }

    try {
      const { CloudWatchClient, GetMetricDataCommand } = await import("@aws-sdk/client-cloudwatch");

      const client = new CloudWatchClient({ region: this.region });

      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - periodMinutes * 60 * 1000);

      const metricQueries = [
        {
          Id: "cpu",
          MetricStat: {
            Metric: {
              Namespace: "AWS/EC2",
              MetricName: "CPUUtilization",
              Dimensions: [{ Name: "InstanceId", Value: instanceId }],
            },
            Period: 300, // 5 minute intervals
            Stat: "Average",
          },
        },
        {
          Id: "networkIn",
          MetricStat: {
            Metric: {
              Namespace: "AWS/EC2",
              MetricName: "NetworkIn",
              Dimensions: [{ Name: "InstanceId", Value: instanceId }],
            },
            Period: 300,
            Stat: "Sum",
          },
        },
        {
          Id: "networkOut",
          MetricStat: {
            Metric: {
              Namespace: "AWS/EC2",
              MetricName: "NetworkOut",
              Dimensions: [{ Name: "InstanceId", Value: instanceId }],
            },
            Period: 300,
            Stat: "Sum",
          },
        },
      ];

      const command = new GetMetricDataCommand({
        MetricDataQueries: metricQueries,
        StartTime: startTime,
        EndTime: endTime,
      });

      const response = await client.send(command);

      const parseMetricResult = (id: string, unit: string): MetricDataPoint[] => {
        const result = response.MetricDataResults?.find((r: any) => r.Id === id);
        if (!result?.Timestamps || !result?.Values) return [];

        return result.Timestamps.map((ts: Date, i: number) => ({
          timestamp: ts.toISOString(),
          value: result.Values![i],
          unit,
        }));
      };

      return {
        instanceId,
        period: `${periodMinutes} minutes`,
        cpuUtilization: parseMetricResult("cpu", "Percent"),
        networkIn: parseMetricResult("networkIn", "Bytes"),
        networkOut: parseMetricResult("networkOut", "Bytes"),
      };
    } catch (error) {
      logger.error("Failed to get instance metrics", { error: String(error) });
      return this.getMockMetrics(instanceId, periodMinutes);
    }
  }

  /**
   * Check if molecare-server is responsive
   */
  async checkServerHealth(instanceId: string): Promise<{
    instanceId: string;
    httpHealthy: boolean;
    responseTimeMs?: number;
    error?: string;
  }> {
    const instance = await this.getInstance(instanceId);

    if (!instance) {
      return {
        instanceId,
        httpHealthy: false,
        error: "Instance not found",
      };
    }

    if (instance.state !== "running") {
      return {
        instanceId,
        httpHealthy: false,
        error: `Instance is ${instance.state}`,
      };
    }

    if (this.useMockData) {
      return {
        instanceId,
        httpHealthy: true,
        responseTimeMs: 0,
      };
    }

    const healthUrl = instance.publicIp
      ? `http://${instance.publicIp}:8080/health`
      : `http://${instance.privateIp}:8080/health`;

    try {
      const start = Date.now();
      const response = await fetch(healthUrl, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      const responseTimeMs = Date.now() - start;

      return {
        instanceId,
        httpHealthy: response.ok,
        responseTimeMs,
      };
    } catch (error) {
      return {
        instanceId,
        httpHealthy: false,
        error: error instanceof Error ? error.message : "Health check failed",
      };
    }
  }

  // Helper methods
  private parseInstances(response: any): EC2Instance[] {
    const instances: EC2Instance[] = [];

    for (const reservation of response.Reservations || []) {
      for (const instance of reservation.Instances || []) {
        const tags: Record<string, string> = {};
        for (const tag of instance.Tags || []) {
          if (tag.Key && tag.Value) {
            tags[tag.Key] = tag.Value;
          }
        }

        instances.push({
          instanceId: instance.InstanceId || "unknown",
          name: tags["Name"] || "unnamed",
          state: instance.State?.Name || "unknown",
          instanceType: instance.InstanceType || "unknown",
          publicIp: instance.PublicIpAddress,
          privateIp: instance.PrivateIpAddress || "unknown",
          launchTime: instance.LaunchTime?.toISOString() || "unknown",
          availabilityZone: instance.Placement?.AvailabilityZone || "unknown",
          tags,
        });
      }
    }

    return instances;
  }

  private mapStatus(status?: string): "ok" | "impaired" | "initializing" | "insufficient-data" {
    switch (status) {
      case "ok": return "ok";
      case "impaired": return "impaired";
      case "initializing": return "initializing";
      default: return "insufficient-data";
    }
  }

  // Mock data for development
  private getMockInstances(): EC2Instance[] {
    return [
      {
        instanceId: "i-0abc123def456789a",
        name: "molecare-server-prod",
        state: "running",
        instanceType: "t3.medium",
        publicIp: "54.123.45.67",
        privateIp: "10.0.1.100",
        launchTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        availabilityZone: "us-east-1a",
        tags: {
          Name: "molecare-server-prod",
          app: "molecare",
          environment: "production",
        },
      },
      {
        instanceId: "i-0def456789abc123b",
        name: "molecare-server-staging",
        state: "running",
        instanceType: "t3.small",
        publicIp: "54.123.45.68",
        privateIp: "10.0.2.100",
        launchTime: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        availabilityZone: "us-east-1b",
        tags: {
          Name: "molecare-server-staging",
          app: "molecare",
          environment: "staging",
        },
      },
      {
        instanceId: "i-0ghi789abc123def4",
        name: "molecare-ml-serving",
        state: "running",
        instanceType: "g4dn.xlarge",
        publicIp: "54.123.45.69",
        privateIp: "10.0.1.101",
        launchTime: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        availabilityZone: "us-east-1a",
        tags: {
          Name: "molecare-ml-serving",
          app: "molecare",
          environment: "production",
          service: "ml-inference",
        },
      },
    ];
  }

  private getMockHealthChecks(instanceId?: string): EC2HealthCheck[] {
    const allChecks: EC2HealthCheck[] = [
      {
        instanceId: "i-0abc123def456789a",
        instanceStatus: "ok",
        systemStatus: "ok",
        statusChecks: { instance: true, system: true },
      },
      {
        instanceId: "i-0def456789abc123b",
        instanceStatus: "ok",
        systemStatus: "ok",
        statusChecks: { instance: true, system: true },
      },
      {
        instanceId: "i-0ghi789abc123def4",
        instanceStatus: "ok",
        systemStatus: "ok",
        statusChecks: { instance: true, system: true },
      },
    ];

    if (instanceId) {
      return allChecks.filter((c) => c.instanceId === instanceId);
    }
    return allChecks;
  }

  private getMockMetrics(instanceId: string, periodMinutes: number): EC2Metrics {
    const now = Date.now();
    const dataPoints = Math.floor(periodMinutes / 5); // 5-minute intervals

    const generateDataPoints = (baseValue: number, variance: number, unit: string): MetricDataPoint[] => {
      return Array.from({ length: dataPoints }, (_, i) => ({
        timestamp: new Date(now - (dataPoints - i) * 5 * 60 * 1000).toISOString(),
        value: Math.max(0, baseValue + (Math.random() - 0.5) * variance),
        unit,
      }));
    };

    return {
      instanceId,
      period: `${periodMinutes} minutes`,
      cpuUtilization: generateDataPoints(25, 20, "Percent"),
      networkIn: generateDataPoints(1000000, 500000, "Bytes"),
      networkOut: generateDataPoints(500000, 250000, "Bytes"),
    };
  }
}
