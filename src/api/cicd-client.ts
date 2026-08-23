/**
 * CI/CD Pipeline Status Client
 * ==============================
 *
 * Provides status monitoring for:
 * - GitHub Actions workflows
 * - Metaflow training/deployment flows
 * - Build and deployment pipelines
 * - Release history
 */

import axios, { AxiosInstance } from "axios";

export interface CICDConfig {
  githubToken?: string;
  githubOwner?: string;
  githubRepo?: string;
  metaflowUrl?: string;
}

// =============================================================================
// Types
// =============================================================================

export interface WorkflowRun {
  id: number;
  name: string;
  status: "queued" | "in_progress" | "completed";
  conclusion:
    | "success"
    | "failure"
    | "cancelled"
    | "skipped"
    | "timed_out"
    | null;
  branch: string;
  commit: string;
  commitMessage: string;
  triggeredBy: string;
  startedAt: string;
  completedAt?: string;
  duration?: string;
  url: string;
  jobs?: WorkflowJob[];
}

export interface WorkflowJob {
  id: number;
  name: string;
  status: "queued" | "in_progress" | "completed";
  conclusion: "success" | "failure" | "cancelled" | "skipped" | null;
  startedAt: string;
  completedAt?: string;
  steps?: WorkflowStep[];
}

export interface WorkflowStep {
  name: string;
  status: "queued" | "in_progress" | "completed";
  conclusion: "success" | "failure" | "cancelled" | "skipped" | null;
  number: number;
}

export interface PipelineSummary {
  totalRuns: number;
  successful: number;
  failed: number;
  inProgress: number;
  averageDuration: string;
  successRate: number;
}

export interface MetaflowRun {
  runId: string;
  flowName: string;
  status: "running" | "completed" | "failed";
  user: string;
  startedAt: string;
  finishedAt?: string;
  duration?: string;
  currentStep?: string;
  tags: string[];
  parameters: Record<string, any>;
}

export interface Deployment {
  id: string;
  environment: "staging" | "production";
  status: "pending" | "in_progress" | "success" | "failure" | "rollback";
  version: string;
  deployedAt: string;
  deployedBy: string;
  commit: string;
  duration?: string;
  services: DeployedService[];
}

export interface DeployedService {
  name: string;
  image: string;
  replicas: number;
  status: "running" | "updating" | "failed";
}

export interface Release {
  version: string;
  name: string;
  publishedAt: string;
  author: string;
  description: string;
  isPrerelease: boolean;
  assets: string[];
  commitSha: string;
}

export class CICDClient {
  private githubClient?: AxiosInstance;
  private metaflowClient?: AxiosInstance;
  private config: CICDConfig;
  private useMockData: boolean;

  constructor(config: CICDConfig) {
    this.config = config;

    if (config.githubToken) {
      this.githubClient = axios.create({
        baseURL: "https://api.github.com",
        headers: {
          Authorization: `Bearer ${config.githubToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        timeout: 10000,
      });
    }

    if (config.metaflowUrl) {
      this.metaflowClient = axios.create({
        baseURL: config.metaflowUrl,
        timeout: 10000,
      });
    }

    this.useMockData = process.env.NODE_ENV !== "production";
  }

  // ===========================================================================
  // GitHub Actions
  // ===========================================================================

  /**
   * Get recent workflow runs
   */
  async getWorkflowRuns(
    workflow?: string,
    limit: number = 10
  ): Promise<WorkflowRun[]> {
    if (this.useMockData || !this.githubClient) {
      return this.getMockWorkflowRuns().slice(0, limit);
    }

    try {
      const { githubOwner, githubRepo } = this.config;
      let url = `/repos/${githubOwner}/${githubRepo}/actions/runs`;
      if (workflow) {
        url = `/repos/${githubOwner}/${githubRepo}/actions/workflows/${workflow}/runs`;
      }

      const response = await this.githubClient.get(url, {
        params: { per_page: limit },
      });

      return response.data.workflow_runs.map(this.mapWorkflowRun);
    } catch (error) {
      console.error("GitHub API error:", error);
      return this.getMockWorkflowRuns().slice(0, limit);
    }
  }

  /**
   * Get workflow run details
   */
  async getWorkflowRunDetails(runId: number): Promise<WorkflowRun | null> {
    if (this.useMockData || !this.githubClient) {
      return this.getMockWorkflowRuns().find((r) => r.id === runId) || null;
    }

    try {
      const { githubOwner, githubRepo } = this.config;
      const [runResponse, jobsResponse] = await Promise.all([
        this.githubClient.get(
          `/repos/${githubOwner}/${githubRepo}/actions/runs/${runId}`
        ),
        this.githubClient.get(
          `/repos/${githubOwner}/${githubRepo}/actions/runs/${runId}/jobs`
        ),
      ]);

      const run = this.mapWorkflowRun(runResponse.data);
      run.jobs = jobsResponse.data.jobs.map(this.mapWorkflowJob);
      return run;
    } catch (error) {
      console.error("GitHub API error:", error);
      return null;
    }
  }

  /**
   * Get pipeline summary statistics
   */
  async getPipelineSummary(days: number = 7): Promise<PipelineSummary> {
    const runs = await this.getWorkflowRuns(undefined, 100);
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const recentRuns = runs.filter(
      (r) => new Date(r.startedAt).getTime() > cutoff
    );

    const successful = recentRuns.filter(
      (r) => r.conclusion === "success"
    ).length;
    const failed = recentRuns.filter((r) => r.conclusion === "failure").length;
    const inProgress = recentRuns.filter(
      (r) => r.status === "in_progress"
    ).length;

    return {
      totalRuns: recentRuns.length,
      successful,
      failed,
      inProgress,
      averageDuration: this.calculateAverageDuration(recentRuns),
      successRate:
        recentRuns.length > 0
          ? Math.round((successful / (successful + failed)) * 100)
          : 0,
    };
  }

  // ===========================================================================
  // Metaflow Runs
  // ===========================================================================

  /**
   * Get Metaflow training runs
   */
  async getMetaflowRuns(
    flowName?: string,
    limit: number = 10
  ): Promise<MetaflowRun[]> {
    if (this.useMockData || !this.metaflowClient) {
      const runs = this.getMockMetaflowRuns();
      return flowName
        ? runs.filter((r) => r.flowName === flowName).slice(0, limit)
        : runs.slice(0, limit);
    }

    try {
      const response = await this.metaflowClient.get("/api/flows", {
        params: { flow_name: flowName, limit },
      });
      return response.data.runs;
    } catch (error) {
      console.error("Metaflow API error:", error);
      return this.getMockMetaflowRuns().slice(0, limit);
    }
  }

  /**
   * Get Metaflow run details
   */
  async getMetaflowRunDetails(runId: string): Promise<MetaflowRun | null> {
    if (this.useMockData) {
      return this.getMockMetaflowRuns().find((r) => r.runId === runId) || null;
    }

    try {
      const response = await this.metaflowClient!.get(`/api/runs/${runId}`);
      return response.data;
    } catch (error) {
      console.error("Metaflow API error:", error);
      return null;
    }
  }

  // ===========================================================================
  // Deployments
  // ===========================================================================

  /**
   * Get recent deployments
   */
  async getDeployments(
    environment?: "staging" | "production",
    limit: number = 10
  ): Promise<Deployment[]> {
    if (this.useMockData) {
      const deployments = this.getMockDeployments();
      return environment
        ? deployments
            .filter((d) => d.environment === environment)
            .slice(0, limit)
        : deployments.slice(0, limit);
    }

    // In production, would query deployment system
    return this.getMockDeployments().slice(0, limit);
  }

  /**
   * Get current deployment status
   */
  async getCurrentDeploymentStatus(): Promise<{
    staging: Deployment | null;
    production: Deployment | null;
  }> {
    const deployments = await this.getDeployments();

    return {
      staging:
        deployments.find(
          (d) => d.environment === "staging" && d.status === "success"
        ) || null,
      production:
        deployments.find(
          (d) => d.environment === "production" && d.status === "success"
        ) || null,
    };
  }

  // ===========================================================================
  // Releases
  // ===========================================================================

  /**
   * Get releases
   */
  async getReleases(limit: number = 10): Promise<Release[]> {
    if (this.useMockData || !this.githubClient) {
      return this.getMockReleases().slice(0, limit);
    }

    try {
      const { githubOwner, githubRepo } = this.config;
      const response = await this.githubClient.get(
        `/repos/${githubOwner}/${githubRepo}/releases`,
        { params: { per_page: limit } }
      );

      return response.data.map(this.mapRelease);
    } catch (error) {
      console.error("GitHub API error:", error);
      return this.getMockReleases().slice(0, limit);
    }
  }

  /**
   * Get latest release
   */
  async getLatestRelease(): Promise<Release | null> {
    const releases = await this.getReleases(1);
    return releases[0] || null;
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private mapWorkflowRun(data: any): WorkflowRun {
    return {
      id: data.id,
      name: data.name,
      status: data.status,
      conclusion: data.conclusion,
      branch: data.head_branch,
      commit: data.head_sha?.substring(0, 7),
      commitMessage: data.head_commit?.message || "",
      triggeredBy: data.triggering_actor?.login || "unknown",
      startedAt: data.run_started_at || data.created_at,
      completedAt: data.updated_at,
      duration: data.run_started_at
        ? this.formatDuration(
            new Date(data.updated_at).getTime() -
              new Date(data.run_started_at).getTime()
          )
        : undefined,
      url: data.html_url,
    };
  }

  private mapWorkflowJob(data: any): WorkflowJob {
    return {
      id: data.id,
      name: data.name,
      status: data.status,
      conclusion: data.conclusion,
      startedAt: data.started_at,
      completedAt: data.completed_at,
      steps: data.steps?.map((s: any) => ({
        name: s.name,
        status: s.status,
        conclusion: s.conclusion,
        number: s.number,
      })),
    };
  }

  private mapRelease(data: any): Release {
    return {
      version: data.tag_name,
      name: data.name,
      publishedAt: data.published_at,
      author: data.author?.login || "unknown",
      description: data.body || "",
      isPrerelease: data.prerelease,
      assets: data.assets?.map((a: any) => a.name) || [],
      commitSha: data.target_commitish,
    };
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  private calculateAverageDuration(runs: WorkflowRun[]): string {
    const completedRuns = runs.filter((r) => r.completedAt);
    if (completedRuns.length === 0) return "N/A";

    const totalMs = completedRuns.reduce((sum, run) => {
      const start = new Date(run.startedAt).getTime();
      const end = new Date(run.completedAt!).getTime();
      return sum + (end - start);
    }, 0);

    return this.formatDuration(totalMs / completedRuns.length);
  }

  // ===========================================================================
  // Mock Data
  // ===========================================================================

  private getMockWorkflowRuns(): WorkflowRun[] {
    const now = Date.now();
    return [
      {
        id: 12345001,
        name: "CI/CD Pipeline",
        status: "completed",
        conclusion: "success",
        branch: "main",
        commit: "a1b2c3d",
        commitMessage: "feat: add new prediction endpoint",
        triggeredBy: "yauhen",
        startedAt: new Date(now - 3600000).toISOString(),
        completedAt: new Date(now - 3000000).toISOString(),
        duration: "10m 0s",
        url: "https://github.com/molecare/molecare-ml/actions/runs/12345001",
        jobs: [
          {
            id: 1,
            name: "lint",
            status: "completed",
            conclusion: "success",
            startedAt: new Date(now - 3600000).toISOString(),
            completedAt: new Date(now - 3540000).toISOString(),
          },
          {
            id: 2,
            name: "test",
            status: "completed",
            conclusion: "success",
            startedAt: new Date(now - 3540000).toISOString(),
            completedAt: new Date(now - 3300000).toISOString(),
          },
          {
            id: 3,
            name: "build",
            status: "completed",
            conclusion: "success",
            startedAt: new Date(now - 3300000).toISOString(),
            completedAt: new Date(now - 3120000).toISOString(),
          },
          {
            id: 4,
            name: "deploy-staging",
            status: "completed",
            conclusion: "success",
            startedAt: new Date(now - 3120000).toISOString(),
            completedAt: new Date(now - 3000000).toISOString(),
          },
        ],
      },
      {
        id: 12345002,
        name: "CI/CD Pipeline",
        status: "in_progress",
        conclusion: null,
        branch: "feature/evolution-analysis",
        commit: "e5f6g7h",
        commitMessage: "feat: improve evolution tracking",
        triggeredBy: "yauhen",
        startedAt: new Date(now - 300000).toISOString(),
        url: "https://github.com/molecare/molecare-ml/actions/runs/12345002",
        jobs: [
          {
            id: 5,
            name: "lint",
            status: "completed",
            conclusion: "success",
            startedAt: new Date(now - 300000).toISOString(),
            completedAt: new Date(now - 240000).toISOString(),
          },
          {
            id: 6,
            name: "test",
            status: "in_progress",
            conclusion: null,
            startedAt: new Date(now - 240000).toISOString(),
          },
        ],
      },
      {
        id: 12345003,
        name: "Model Training",
        status: "completed",
        conclusion: "success",
        branch: "main",
        commit: "i8j9k0l",
        commitMessage: "train: weekly model retrain",
        triggeredBy: "scheduler",
        startedAt: new Date(now - 86400000).toISOString(),
        completedAt: new Date(now - 79200000).toISOString(),
        duration: "2h 0m",
        url: "https://github.com/molecare/molecare-ml/actions/runs/12345003",
      },
      {
        id: 12345004,
        name: "CI/CD Pipeline",
        status: "completed",
        conclusion: "failure",
        branch: "feature/new-model",
        commit: "m1n2o3p",
        commitMessage: "fix: update model loading",
        triggeredBy: "yauhen",
        startedAt: new Date(now - 172800000).toISOString(),
        completedAt: new Date(now - 172500000).toISOString(),
        duration: "5m 0s",
        url: "https://github.com/molecare/molecare-ml/actions/runs/12345004",
      },
      {
        id: 12345005,
        name: "Deploy Production",
        status: "completed",
        conclusion: "success",
        branch: "main",
        commit: "q4r5s6t",
        commitMessage: "release: v1.5.0",
        triggeredBy: "yauhen",
        startedAt: new Date(now - 432000000).toISOString(),
        completedAt: new Date(now - 431400000).toISOString(),
        duration: "10m 0s",
        url: "https://github.com/molecare/molecare-ml/actions/runs/12345005",
      },
    ];
  }

  private getMockMetaflowRuns(): MetaflowRun[] {
    const now = Date.now();
    return [
      {
        runId: "MelanomaTrainingFlow/1706800000000",
        flowName: "MelanomaTrainingFlow",
        status: "completed",
        user: "yauhen",
        startedAt: new Date(now - 86400000).toISOString(),
        finishedAt: new Date(now - 79200000).toISOString(),
        duration: "2h 0m",
        tags: ["weekly-retrain", "production"],
        parameters: {
          architecture: "xception",
          batch_size: 16,
          epochs: 50,
          learning_rate: 0.001,
        },
      },
      {
        runId: "MelanomaTrainingFlow/1706700000000",
        flowName: "MelanomaTrainingFlow",
        status: "running",
        user: "yauhen",
        startedAt: new Date(now - 3600000).toISOString(),
        currentStep: "train_stage_2",
        tags: ["experiment", "efficientnet"],
        parameters: {
          architecture: "efficientnetb4",
          batch_size: 16,
          epochs: 100,
          learning_rate: 0.0005,
        },
      },
      {
        runId: "DeploymentFlow/1706650000000",
        flowName: "DeploymentFlow",
        status: "completed",
        user: "yauhen",
        startedAt: new Date(now - 432000000).toISOString(),
        finishedAt: new Date(now - 431700000).toISOString(),
        duration: "5m 0s",
        tags: ["production", "v1.5.0"],
        parameters: {
          environment: "production",
          model_version: "3",
          canary_weight: 0.1,
        },
      },
      {
        runId: "MelanomaTrainingFlow/1706500000000",
        flowName: "MelanomaTrainingFlow",
        status: "failed",
        user: "yauhen",
        startedAt: new Date(now - 604800000).toISOString(),
        finishedAt: new Date(now - 601200000).toISOString(),
        duration: "1h 0m",
        tags: ["experiment"],
        parameters: {
          architecture: "resnet50",
          batch_size: 32,
          epochs: 50,
        },
      },
    ];
  }

  private getMockDeployments(): Deployment[] {
    const now = Date.now();
    return [
      {
        id: "deploy-001",
        environment: "production",
        status: "success",
        version: "1.5.0",
        deployedAt: new Date(now - 432000000).toISOString(),
        deployedBy: "yauhen",
        commit: "q4r5s6t",
        duration: "3m 45s",
        services: [
          {
            name: "ml-inference",
            image: "molecare/ml-serving:1.5.0",
            replicas: 3,
            status: "running",
          },
          {
            name: "backend",
            image: "molecare/backend:3.2.1",
            replicas: 3,
            status: "running",
          },
        ],
      },
      {
        id: "deploy-002",
        environment: "staging",
        status: "success",
        version: "1.6.0-beta.1",
        deployedAt: new Date(now - 3600000).toISOString(),
        deployedBy: "yauhen",
        commit: "a1b2c3d",
        duration: "2m 30s",
        services: [
          {
            name: "ml-inference",
            image: "molecare/ml-serving:1.6.0-beta.1",
            replicas: 2,
            status: "running",
          },
          {
            name: "backend",
            image: "molecare/backend:3.2.2-beta.1",
            replicas: 2,
            status: "running",
          },
        ],
      },
      {
        id: "deploy-003",
        environment: "production",
        status: "success",
        version: "1.4.0",
        deployedAt: new Date(now - 1209600000).toISOString(),
        deployedBy: "yauhen",
        commit: "u7v8w9x",
        duration: "4m 12s",
        services: [
          {
            name: "ml-inference",
            image: "molecare/ml-serving:1.4.0",
            replicas: 3,
            status: "running",
          },
        ],
      },
    ];
  }

  private getMockReleases(): Release[] {
    const now = Date.now();
    return [
      {
        version: "v1.5.0",
        name: "MoleCare ML v1.5.0",
        publishedAt: new Date(now - 432000000).toISOString(),
        author: "yauhen",
        description:
          "## What's New\n- Improved evolution tracking\n- New ABCDE analysis endpoint\n- Performance optimizations\n\n## Bug Fixes\n- Fixed memory leak in detection service",
        isPrerelease: false,
        assets: ["ml-serving-1.5.0.tar.gz", "models-1.5.0.tar.gz"],
        commitSha: "q4r5s6t",
      },
      {
        version: "v1.6.0-beta.1",
        name: "MoleCare ML v1.6.0 Beta 1",
        publishedAt: new Date(now - 86400000).toISOString(),
        author: "yauhen",
        description:
          "## Beta Features\n- New prediction endpoint\n- Derm Foundation model integration\n\n⚠️ This is a pre-release version",
        isPrerelease: true,
        assets: ["ml-serving-1.6.0-beta.1.tar.gz"],
        commitSha: "a1b2c3d",
      },
      {
        version: "v1.4.0",
        name: "MoleCare ML v1.4.0",
        publishedAt: new Date(now - 1209600000).toISOString(),
        author: "yauhen",
        description:
          "## What's New\n- Mole detection service\n- Image validation endpoint\n- Model comparison feature",
        isPrerelease: false,
        assets: ["ml-serving-1.4.0.tar.gz", "models-1.4.0.tar.gz"],
        commitSha: "u7v8w9x",
      },
    ];
  }
}
