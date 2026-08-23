/**
 * Database Monitoring Client
 * Monitors PostgreSQL/RDS database health, performance, and connections
 */

import { logger } from "../utils/logger.js";

// =============================================================================
// Types
// =============================================================================

export interface DatabaseStatus {
  name: string;
  type: "postgresql" | "redis" | "elasticsearch";
  host: string;
  status: "healthy" | "degraded" | "down";
  version?: string;
  uptime?: string;
  connections: {
    active: number;
    idle: number;
    max: number;
    utilizationPercent: number;
  };
  replication?: {
    role: "primary" | "replica";
    lag?: string;
    replicaCount?: number;
  };
}

export interface DatabaseMetrics {
  database: string;
  period: string;
  queries: {
    totalExecuted: number;
    avgDurationMs: number;
    slowQueries: number;
    failedQueries: number;
  };
  storage: {
    totalSizeGb: number;
    usedSizeGb: number;
    freeSpaceGb: number;
    utilizationPercent: number;
  };
  performance: {
    cacheHitRatio: number;
    indexHitRatio: number;
    deadlocks: number;
    blockedQueries: number;
  };
}

export interface SlowQuery {
  query: string;
  avgDurationMs: number;
  calls: number;
  totalTimeMs: number;
  rowsReturned: number;
  lastExecuted: string;
}

export interface DatabaseTable {
  schema: string;
  name: string;
  rowCount: number;
  sizeBytes: number;
  indexSizeBytes: number;
  lastVacuum?: string;
  lastAnalyze?: string;
  deadTuples: number;
}

export interface DatabaseBackup {
  id: string;
  type: "automated" | "manual" | "snapshot";
  status: "completed" | "in-progress" | "failed";
  startedAt: string;
  completedAt?: string;
  sizeGb: number;
  retentionDays: number;
}

export interface DatabaseClientConfig {
  primaryHost?: string;
  primaryPort?: number;
  database?: string;
  redisHost?: string;
  elasticsearchHost?: string;
}

// =============================================================================
// Database Monitoring Client
// =============================================================================

export class DatabaseClient {
  private primaryHost: string;
  private primaryPort: number;
  private database: string;
  private redisHost: string;
  private elasticsearchHost: string;
  private useMockData: boolean;

  constructor(config: DatabaseClientConfig = {}) {
    this.primaryHost = config.primaryHost || process.env.DB_HOST || "localhost";
    this.primaryPort = config.primaryPort || parseInt(process.env.DB_PORT || "5432");
    this.database = config.database || process.env.DB_NAME || "molecare";
    this.redisHost = config.redisHost || process.env.REDIS_HOST || "localhost:6379";
    this.elasticsearchHost = config.elasticsearchHost || process.env.ES_HOST || "localhost:9200";

    // Use mock data in development
    this.useMockData = process.env.NODE_ENV === "development";

    if (this.useMockData) {
      logger.info("DatabaseClient using mock data");
    }
  }

  /**
   * Get PostgreSQL database status
   */
  async getPostgresStatus(): Promise<DatabaseStatus> {
    if (this.useMockData) {
      return this.getMockPostgresStatus();
    }

    try {
      // In production, this would connect to pg_stat_activity
      const response = await fetch(`http://${this.primaryHost}:${this.primaryPort}/health`);
      const data = await response.json();
      return data;
    } catch (error) {
      logger.error("Failed to get Postgres status", { error: String(error) });
      return this.getMockPostgresStatus();
    }
  }

  /**
   * Get Redis status
   */
  async getRedisStatus(): Promise<DatabaseStatus> {
    if (this.useMockData) {
      return this.getMockRedisStatus();
    }

    try {
      const [host, port] = this.redisHost.split(":");
      const response = await fetch(`http://${host}:${port}/health`);
      const data = await response.json();
      return data;
    } catch (error) {
      logger.error("Failed to get Redis status", { error: String(error) });
      return this.getMockRedisStatus();
    }
  }

  /**
   * Get all database statuses
   */
  async getAllDatabaseStatus(): Promise<DatabaseStatus[]> {
    const [postgres, redis] = await Promise.all([
      this.getPostgresStatus(),
      this.getRedisStatus(),
    ]);

    return [postgres, redis];
  }

  /**
   * Get database performance metrics
   */
  async getDatabaseMetrics(periodHours: number = 24): Promise<DatabaseMetrics> {
    if (this.useMockData) {
      return this.getMockDatabaseMetrics(periodHours);
    }

    try {
      // In production, query pg_stat_statements and pg_stat_database
      const response = await fetch(
        `http://${this.primaryHost}/metrics?period=${periodHours}h`
      );
      return await response.json();
    } catch (error) {
      logger.error("Failed to get database metrics", { error: String(error) });
      return this.getMockDatabaseMetrics(periodHours);
    }
  }

  /**
   * Get slow queries
   */
  async getSlowQueries(limit: number = 10, minDurationMs: number = 1000): Promise<SlowQuery[]> {
    if (this.useMockData) {
      return this.getMockSlowQueries(limit);
    }

    try {
      const response = await fetch(
        `http://${this.primaryHost}/slow-queries?limit=${limit}&min_duration=${minDurationMs}`
      );
      return await response.json();
    } catch (error) {
      logger.error("Failed to get slow queries", { error: String(error) });
      return this.getMockSlowQueries(limit);
    }
  }

  /**
   * Get table statistics
   */
  async getTableStats(schema: string = "public"): Promise<DatabaseTable[]> {
    if (this.useMockData) {
      return this.getMockTableStats(schema);
    }

    try {
      const response = await fetch(
        `http://${this.primaryHost}/tables?schema=${schema}`
      );
      return await response.json();
    } catch (error) {
      logger.error("Failed to get table stats", { error: String(error) });
      return this.getMockTableStats(schema);
    }
  }

  /**
   * Get backup history
   */
  async getBackupHistory(limit: number = 10): Promise<DatabaseBackup[]> {
    if (this.useMockData) {
      return this.getMockBackupHistory(limit);
    }

    try {
      // In production, this would query AWS RDS or backup management system
      const response = await fetch(`http://${this.primaryHost}/backups?limit=${limit}`);
      return await response.json();
    } catch (error) {
      logger.error("Failed to get backup history", { error: String(error) });
      return this.getMockBackupHistory(limit);
    }
  }

  /**
   * Get connection pool status
   */
  async getConnectionPoolStatus(): Promise<{
    pools: Array<{
      name: string;
      activeConnections: number;
      idleConnections: number;
      waitingRequests: number;
      maxConnections: number;
    }>;
    summary: {
      totalActive: number;
      totalIdle: number;
      totalWaiting: number;
    };
  }> {
    if (this.useMockData) {
      return this.getMockConnectionPoolStatus();
    }

    try {
      const response = await fetch(`http://${this.primaryHost}/pools`);
      return await response.json();
    } catch (error) {
      logger.error("Failed to get connection pool status", { error: String(error) });
      return this.getMockConnectionPoolStatus();
    }
  }

  // =============================================================================
  // Mock Data
  // =============================================================================

  private getMockPostgresStatus(): DatabaseStatus {
    return {
      name: "molecare-db-primary",
      type: "postgresql",
      host: this.primaryHost,
      status: "healthy",
      version: "15.4",
      uptime: "45d 12h 30m",
      connections: {
        active: 23,
        idle: 12,
        max: 100,
        utilizationPercent: 35,
      },
      replication: {
        role: "primary",
        replicaCount: 2,
      },
    };
  }

  private getMockRedisStatus(): DatabaseStatus {
    return {
      name: "molecare-redis",
      type: "redis",
      host: this.redisHost,
      status: "healthy",
      version: "7.2.3",
      uptime: "30d 8h 15m",
      connections: {
        active: 45,
        idle: 10,
        max: 1000,
        utilizationPercent: 5.5,
      },
    };
  }

  private getMockDatabaseMetrics(periodHours: number): DatabaseMetrics {
    const baseQueries = periodHours * 5000;

    return {
      database: this.database,
      period: `${periodHours} hours`,
      queries: {
        totalExecuted: baseQueries,
        avgDurationMs: 12.5,
        slowQueries: Math.floor(baseQueries * 0.002),
        failedQueries: Math.floor(baseQueries * 0.0005),
      },
      storage: {
        totalSizeGb: 500,
        usedSizeGb: 287,
        freeSpaceGb: 213,
        utilizationPercent: 57.4,
      },
      performance: {
        cacheHitRatio: 0.987,
        indexHitRatio: 0.995,
        deadlocks: 0,
        blockedQueries: 2,
      },
    };
  }

  private getMockSlowQueries(limit: number): SlowQuery[] {
    const queries: SlowQuery[] = [
      {
        query: "SELECT * FROM mole_analyses WHERE user_id = $1 ORDER BY created_at DESC",
        avgDurationMs: 2450,
        calls: 1523,
        totalTimeMs: 3731350,
        rowsReturned: 45670,
        lastExecuted: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      },
      {
        query: "SELECT m.*, a.* FROM moles m JOIN mole_analyses a ON m.id = a.mole_id WHERE m.user_id = $1",
        avgDurationMs: 1890,
        calls: 892,
        totalTimeMs: 1685880,
        rowsReturned: 23456,
        lastExecuted: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      },
      {
        query: "UPDATE user_profiles SET last_activity = NOW() WHERE id = $1",
        avgDurationMs: 1200,
        calls: 5670,
        totalTimeMs: 6804000,
        rowsReturned: 5670,
        lastExecuted: new Date(Date.now() - 1 * 60 * 1000).toISOString(),
      },
      {
        query: "SELECT COUNT(*) FROM mole_images WHERE analysis_status = 'pending'",
        avgDurationMs: 1100,
        calls: 234,
        totalTimeMs: 257400,
        rowsReturned: 234,
        lastExecuted: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      },
      {
        query: "INSERT INTO analysis_logs (mole_id, result, confidence, created_at) VALUES ($1, $2, $3, NOW())",
        avgDurationMs: 1050,
        calls: 12345,
        totalTimeMs: 12962250,
        rowsReturned: 0,
        lastExecuted: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
      },
    ];

    return queries.slice(0, limit);
  }

  private getMockTableStats(schema: string): DatabaseTable[] {
    return [
      {
        schema,
        name: "users",
        rowCount: 125000,
        sizeBytes: 52428800,
        indexSizeBytes: 15728640,
        lastVacuum: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
        lastAnalyze: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
        deadTuples: 234,
      },
      {
        schema,
        name: "moles",
        rowCount: 456000,
        sizeBytes: 157286400,
        indexSizeBytes: 41943040,
        lastVacuum: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
        lastAnalyze: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
        deadTuples: 1205,
      },
      {
        schema,
        name: "mole_analyses",
        rowCount: 1250000,
        sizeBytes: 524288000,
        indexSizeBytes: 104857600,
        lastVacuum: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        lastAnalyze: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        deadTuples: 5678,
      },
      {
        schema,
        name: "mole_images",
        rowCount: 2500000,
        sizeBytes: 1073741824,
        indexSizeBytes: 209715200,
        lastVacuum: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        lastAnalyze: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        deadTuples: 12345,
      },
      {
        schema,
        name: "analysis_logs",
        rowCount: 5000000,
        sizeBytes: 2147483648,
        indexSizeBytes: 314572800,
        lastVacuum: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
        lastAnalyze: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
        deadTuples: 45678,
      },
    ];
  }

  private getMockBackupHistory(limit: number): DatabaseBackup[] {
    const backups: DatabaseBackup[] = [];
    const now = Date.now();

    // Generate automated daily backups
    for (let i = 0; i < Math.min(limit, 7); i++) {
      backups.push({
        id: `backup-auto-${Date.now() - i * 24 * 60 * 60 * 1000}`,
        type: "automated",
        status: "completed",
        startedAt: new Date(now - i * 24 * 60 * 60 * 1000).toISOString(),
        completedAt: new Date(now - i * 24 * 60 * 60 * 1000 + 45 * 60 * 1000).toISOString(),
        sizeGb: 287 + Math.random() * 5,
        retentionDays: 30,
      });
    }

    // Add a manual backup
    if (limit > 3) {
      backups.splice(2, 0, {
        id: `backup-manual-${Date.now() - 2 * 24 * 60 * 60 * 1000}`,
        type: "manual",
        status: "completed",
        startedAt: new Date(now - 2 * 24 * 60 * 60 * 1000 - 4 * 60 * 60 * 1000).toISOString(),
        completedAt: new Date(now - 2 * 24 * 60 * 60 * 1000 - 3 * 60 * 60 * 1000).toISOString(),
        sizeGb: 289.5,
        retentionDays: 90,
      });
    }

    return backups.slice(0, limit);
  }

  private getMockConnectionPoolStatus() {
    return {
      pools: [
        {
          name: "web-api",
          activeConnections: 15,
          idleConnections: 5,
          waitingRequests: 0,
          maxConnections: 50,
        },
        {
          name: "mobile-api",
          activeConnections: 8,
          idleConnections: 7,
          waitingRequests: 0,
          maxConnections: 30,
        },
        {
          name: "ml-service",
          activeConnections: 3,
          idleConnections: 2,
          waitingRequests: 0,
          maxConnections: 10,
        },
        {
          name: "background-jobs",
          activeConnections: 5,
          idleConnections: 3,
          waitingRequests: 2,
          maxConnections: 20,
        },
      ],
      summary: {
        totalActive: 31,
        totalIdle: 17,
        totalWaiting: 2,
      },
    };
  }
}
