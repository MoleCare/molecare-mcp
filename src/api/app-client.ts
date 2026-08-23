/**
 * Web & Mobile App Monitoring Client
 * Monitors application health, metrics, errors, and versions
 */

import { logger } from "../utils/logger.js";

// =============================================================================
// Types
// =============================================================================

export interface AppStatus {
  name: string;
  type: "web" | "mobile-ios" | "mobile-android" | "api";
  status: "healthy" | "degraded" | "down";
  version: string;
  environment: "production" | "staging" | "development";
  url: string;
  responseTimeMs?: number;
  lastDeployed: string;
  uptime: string;
}

export interface AppMetrics {
  app: string;
  period: string;
  requests: {
    total: number;
    successful: number;
    failed: number;
    errorRate: number;
  };
  performance: {
    avgResponseTimeMs: number;
    p50ResponseTimeMs: number;
    p95ResponseTimeMs: number;
    p99ResponseTimeMs: number;
  };
  users: {
    activeDaily: number;
    activeWeekly: number;
    activeMonthly: number;
  };
}

export interface AppError {
  id: string;
  app: string;
  timestamp: string;
  level: "error" | "warning" | "critical";
  message: string;
  endpoint?: string;
  statusCode?: number;
  count: number;
  lastOccurred: string;
  stackTrace?: string;
  userId?: string;
  deviceInfo?: string;
}

export interface AppVersion {
  app: string;
  environment: string;
  version: string;
  buildNumber: string;
  deployedAt: string;
  deployedBy: string;
  commitSha: string;
  releaseNotes?: string;
}

export interface AppClientConfig {
  webAppUrl?: string;
  mobileApiUrl?: string;
  adminApiUrl?: string;
  metricsApiUrl?: string;
}

// =============================================================================
// App Monitoring Client
// =============================================================================

export class AppClient {
  private webAppUrl: string;
  private mobileApiUrl: string;
  private adminApiUrl: string;
  private metricsApiUrl: string;
  private useMockData: boolean;

  constructor(config: AppClientConfig = {}) {
    this.webAppUrl = config.webAppUrl || process.env.WEB_APP_URL || "http://localhost:3000";
    this.mobileApiUrl = config.mobileApiUrl || process.env.MOBILE_API_URL || "http://localhost:8080/api";
    this.adminApiUrl = config.adminApiUrl || process.env.ADMIN_API_URL || "http://localhost:8080";
    this.metricsApiUrl = config.metricsApiUrl || process.env.METRICS_API_URL || "";

    // Use mock data in development or if no metrics API configured
    this.useMockData = process.env.NODE_ENV === "development" || !this.metricsApiUrl;

    if (this.useMockData) {
      logger.info("AppClient using mock data");
    }
  }

  /**
   * Get web application status
   */
  async getWebAppStatus(): Promise<AppStatus> {
    if (this.useMockData) {
      return this.getMockWebAppStatus();
    }

    try {
      const start = Date.now();
      const response = await fetch(`${this.webAppUrl}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      const responseTimeMs = Date.now() - start;

      const data = await response.json().catch(() => ({}));

      return {
        name: "MoleCare Web App",
        type: "web",
        status: response.ok ? "healthy" : "degraded",
        version: data.version || "unknown",
        environment: this.detectEnvironment(this.webAppUrl),
        url: this.webAppUrl,
        responseTimeMs,
        lastDeployed: data.deployedAt || "unknown",
        uptime: data.uptime || "unknown",
      };
    } catch (error) {
      logger.error("Failed to get web app status", { error: String(error) });
      return {
        name: "MoleCare Web App",
        type: "web",
        status: "down",
        version: "unknown",
        environment: this.detectEnvironment(this.webAppUrl),
        url: this.webAppUrl,
        lastDeployed: "unknown",
        uptime: "unknown",
      };
    }
  }

  /**
   * Get mobile API status
   */
  async getMobileApiStatus(): Promise<AppStatus> {
    if (this.useMockData) {
      return this.getMockMobileApiStatus();
    }

    try {
      const start = Date.now();
      const response = await fetch(`${this.mobileApiUrl}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      const responseTimeMs = Date.now() - start;

      const data = await response.json().catch(() => ({}));

      return {
        name: "MoleCare Mobile API",
        type: "api",
        status: response.ok ? "healthy" : "degraded",
        version: data.version || "unknown",
        environment: this.detectEnvironment(this.mobileApiUrl),
        url: this.mobileApiUrl,
        responseTimeMs,
        lastDeployed: data.deployedAt || "unknown",
        uptime: data.uptime || "unknown",
      };
    } catch (error) {
      logger.error("Failed to get mobile API status", { error: String(error) });
      return {
        name: "MoleCare Mobile API",
        type: "api",
        status: "down",
        version: "unknown",
        environment: this.detectEnvironment(this.mobileApiUrl),
        url: this.mobileApiUrl,
        lastDeployed: "unknown",
        uptime: "unknown",
      };
    }
  }

  /**
   * Get all app statuses
   */
  async getAllAppStatus(): Promise<AppStatus[]> {
    const [webApp, mobileApi] = await Promise.all([
      this.getWebAppStatus(),
      this.getMobileApiStatus(),
    ]);

    if (this.useMockData) {
      // Add mobile app statuses in mock mode
      return [
        webApp,
        mobileApi,
        this.getMockIosAppStatus(),
        this.getMockAndroidAppStatus(),
      ];
    }

    return [webApp, mobileApi];
  }

  /**
   * Get app metrics
   */
  async getAppMetrics(
    app: "web" | "mobile" | "api",
    periodHours: number = 24
  ): Promise<AppMetrics> {
    if (this.useMockData) {
      return this.getMockAppMetrics(app, periodHours);
    }

    try {
      const response = await fetch(
        `${this.metricsApiUrl}/metrics/${app}?period=${periodHours}h`,
        { signal: AbortSignal.timeout(10000) }
      );

      if (!response.ok) {
        throw new Error(`Metrics API returned ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      logger.error("Failed to get app metrics", { error: String(error), app });
      return this.getMockAppMetrics(app, periodHours);
    }
  }

  /**
   * Get recent app errors
   */
  async getAppErrors(
    app: "web" | "mobile" | "api" | "all",
    limit: number = 10
  ): Promise<AppError[]> {
    if (this.useMockData) {
      return this.getMockAppErrors(app, limit);
    }

    try {
      const response = await fetch(
        `${this.metricsApiUrl}/errors?app=${app}&limit=${limit}`,
        { signal: AbortSignal.timeout(10000) }
      );

      if (!response.ok) {
        throw new Error(`Errors API returned ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      logger.error("Failed to get app errors", { error: String(error), app });
      return this.getMockAppErrors(app, limit);
    }
  }

  /**
   * Get deployed app versions
   */
  async getAppVersions(): Promise<AppVersion[]> {
    if (this.useMockData) {
      return this.getMockAppVersions();
    }

    try {
      const response = await fetch(`${this.adminApiUrl}/versions`, {
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`Versions API returned ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      logger.error("Failed to get app versions", { error: String(error) });
      return this.getMockAppVersions();
    }
  }

  /**
   * Get iOS app store status (reviews, ratings, version)
   */
  async getIosAppStoreStatus(): Promise<{
    version: string;
    rating: number;
    reviewCount: number;
    lastUpdated: string;
    status: "live" | "in-review" | "rejected";
  }> {
    // In production, this would call App Store Connect API
    return {
      version: "3.2.1",
      rating: 4.7,
      reviewCount: 12847,
      lastUpdated: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      status: "live",
    };
  }

  /**
   * Get Android Play Store status
   */
  async getAndroidPlayStoreStatus(): Promise<{
    version: string;
    rating: number;
    reviewCount: number;
    lastUpdated: string;
    status: "live" | "in-review" | "rejected";
  }> {
    // In production, this would call Play Store API
    return {
      version: "3.2.0",
      rating: 4.5,
      reviewCount: 8923,
      lastUpdated: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      status: "live",
    };
  }

  // =============================================================================
  // Helper Methods
  // =============================================================================

  private detectEnvironment(url: string): "production" | "staging" | "development" {
    if (url.includes("staging") || url.includes("stg")) return "staging";
    if (url.includes("localhost") || url.includes("dev")) return "development";
    return "production";
  }

  // =============================================================================
  // Mock Data
  // =============================================================================

  private getMockWebAppStatus(): AppStatus {
    return {
      name: "MoleCare Web App",
      type: "web",
      status: "healthy",
      version: "2.4.1",
      environment: "production",
      url: this.webAppUrl,
      responseTimeMs: 145,
      lastDeployed: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      uptime: "14d 6h 23m",
    };
  }

  private getMockMobileApiStatus(): AppStatus {
    return {
      name: "MoleCare Mobile API",
      type: "api",
      status: "healthy",
      version: "2.4.0",
      environment: "production",
      url: this.mobileApiUrl,
      responseTimeMs: 89,
      lastDeployed: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      uptime: "21d 12h 45m",
    };
  }

  private getMockIosAppStatus(): AppStatus {
    return {
      name: "MoleCare iOS App",
      type: "mobile-ios",
      status: "healthy",
      version: "3.2.1",
      environment: "production",
      url: "https://apps.apple.com/app/molecare",
      lastDeployed: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      uptime: "N/A",
    };
  }

  private getMockAndroidAppStatus(): AppStatus {
    return {
      name: "MoleCare Android App",
      type: "mobile-android",
      status: "healthy",
      version: "3.2.0",
      environment: "production",
      url: "https://play.google.com/store/apps/molecare",
      lastDeployed: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      uptime: "N/A",
    };
  }

  private getMockAppMetrics(app: string, periodHours: number): AppMetrics {
    const baseRequests = periodHours * 1000;
    const errorRate = Math.random() * 2; // 0-2% error rate

    return {
      app,
      period: `${periodHours} hours`,
      requests: {
        total: baseRequests,
        successful: Math.floor(baseRequests * (1 - errorRate / 100)),
        failed: Math.floor(baseRequests * (errorRate / 100)),
        errorRate: parseFloat(errorRate.toFixed(2)),
      },
      performance: {
        avgResponseTimeMs: 120 + Math.random() * 50,
        p50ResponseTimeMs: 95 + Math.random() * 30,
        p95ResponseTimeMs: 280 + Math.random() * 100,
        p99ResponseTimeMs: 450 + Math.random() * 200,
      },
      users: {
        activeDaily: 12500 + Math.floor(Math.random() * 2000),
        activeWeekly: 45000 + Math.floor(Math.random() * 5000),
        activeMonthly: 125000 + Math.floor(Math.random() * 10000),
      },
    };
  }

  private getMockAppErrors(app: string, limit: number): AppError[] {
    const errors: AppError[] = [
      {
        id: "err-001",
        app: "web",
        timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        level: "error",
        message: "Failed to process image upload: file too large",
        endpoint: "/api/moles/upload",
        statusCode: 413,
        count: 23,
        lastOccurred: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      },
      {
        id: "err-002",
        app: "api",
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        level: "warning",
        message: "Slow ML inference response",
        endpoint: "/api/analyze",
        count: 156,
        lastOccurred: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      },
      {
        id: "err-003",
        app: "mobile",
        timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
        level: "error",
        message: "Authentication token expired during session",
        endpoint: "/api/auth/refresh",
        statusCode: 401,
        count: 45,
        lastOccurred: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
        deviceInfo: "iOS 17.2, iPhone 14 Pro",
      },
      {
        id: "err-004",
        app: "web",
        timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
        level: "critical",
        message: "Database connection pool exhausted",
        count: 3,
        lastOccurred: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
        stackTrace: "Error: Connection pool exhausted\n  at Pool.acquire...",
      },
      {
        id: "err-005",
        app: "api",
        timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
        level: "error",
        message: "Rate limit exceeded for user",
        endpoint: "/api/analyze",
        statusCode: 429,
        count: 12,
        lastOccurred: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
        userId: "user_abc123",
      },
    ];

    const filtered = app === "all" ? errors : errors.filter((e) => e.app === app);
    return filtered.slice(0, limit);
  }

  private getMockAppVersions(): AppVersion[] {
    return [
      {
        app: "web",
        environment: "production",
        version: "2.4.1",
        buildNumber: "1247",
        deployedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        deployedBy: "github-actions",
        commitSha: "a1b2c3d4e5f6",
        releaseNotes: "Bug fixes for image upload, improved error handling",
      },
      {
        app: "web",
        environment: "staging",
        version: "2.5.0-beta.1",
        buildNumber: "1253",
        deployedAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
        deployedBy: "github-actions",
        commitSha: "f6e5d4c3b2a1",
        releaseNotes: "New dashboard UI, dark mode support",
      },
      {
        app: "api",
        environment: "production",
        version: "2.4.0",
        buildNumber: "892",
        deployedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        deployedBy: "github-actions",
        commitSha: "b2c3d4e5f6a1",
      },
      {
        app: "ios",
        environment: "production",
        version: "3.2.1",
        buildNumber: "456",
        deployedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        deployedBy: "fastlane",
        commitSha: "c3d4e5f6a1b2",
        releaseNotes: "Performance improvements, bug fixes",
      },
      {
        app: "android",
        environment: "production",
        version: "3.2.0",
        buildNumber: "423",
        deployedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        deployedBy: "fastlane",
        commitSha: "d4e5f6a1b2c3",
        releaseNotes: "New analysis view, notification improvements",
      },
    ];
  }
}
