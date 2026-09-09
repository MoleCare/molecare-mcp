/**
 * MoleCare API Client
 * ====================
 *
 * Communicates with the MoleCare Spring Boot backend to fetch
 * mole data, analysis results, and user profiles.
 */

import axios, { AxiosInstance } from "axios";

interface MoleCareApiConfig {
  baseUrl: string;
  apiKey: string;
  /**
   * Serve synthetic records instead of calling the backend. Defaults to true
   * when either the URL or the key is missing, so a fresh checkout works
   * without credentials. When false, a backend failure is an error — never
   * fake data that could be mistaken for a real record.
   */
  mockMode?: boolean;
}

export type MoleCareDataSource = "mock" | "molecare-api";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Ids are interpolated into request paths; refuse anything that is not a plain identifier. */
function pathId(value: string, name: string): string {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    throw new Error(`${name} must be 1-64 letters, digits, '_' or '-'`);
  }
  return encodeURIComponent(value);
}

interface Mole {
  id: string;
  bodyPart: string;
  nickname?: string;
  createdAt: string;
  lastAnalyzedAt?: string;
  images?: any[];
}

interface Analysis {
  date: string;
  asymmetryScore: number;
  borderScore: number;
  colorScore: number;
  colorVariations: string[];
  diameterMm: number;
  evolutionScore: number;
}

interface MoleHistory {
  startDate: string;
  imageCount: number;
  changes: any[];
  trend: string;
}

interface UserProfile {
  skinType: number;
  riskFactors: string[];
}

interface ImageComparison {
  sizeChangePercent: number;
  colorChange: string;
  borderChange: string;
  overallChange: string;
}

export class MoleCareApiClient {
  private client: AxiosInstance;
  readonly mockMode: boolean;
  /** What every tool result reports as its origin. */
  readonly dataSource: MoleCareDataSource;

  constructor(config: MoleCareApiConfig) {
    this.mockMode = config.mockMode ?? !(config.baseUrl && config.apiKey);
    this.dataSource = this.mockMode ? "mock" : "molecare-api";
    this.client = axios.create({
      baseURL: config.baseUrl,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });
  }

  /**
   * Get all moles for a user
   */
  async getUserMoles(userId: string): Promise<Mole[]> {
    if (this.mockMode) return this.getMockMoles(userId);
    try {
      const response = await this.client.get(`/moles/user/${pathId(userId, "userId")}`);
      return response.data;
    } catch (error) {
      throw this.apiError("getUserMoles", error);
    }
  }

  /**
   * Get detailed analysis for a mole
   */
  async getMoleAnalysis(moleId: string): Promise<Analysis> {
    if (this.mockMode) return this.getMockAnalysis(moleId);
    try {
      const response = await this.client.get(`/moles/${pathId(moleId, "moleId")}/analysis`);
      return response.data;
    } catch (error) {
      throw this.apiError("getMoleAnalysis", error);
    }
  }

  /**
   * Get change history for a mole
   */
  async getMoleHistory(moleId: string): Promise<MoleHistory> {
    if (this.mockMode) return this.getMockHistory(moleId);
    try {
      const response = await this.client.get(`/moles/${pathId(moleId, "moleId")}/history`);
      return response.data;
    } catch (error) {
      throw this.apiError("getMoleHistory", error);
    }
  }

  /**
   * Get user profile with risk factors
   */
  async getUserProfile(userId: string): Promise<UserProfile> {
    if (this.mockMode) return this.getMockProfile(userId);
    try {
      const response = await this.client.get(`/users/${pathId(userId, "userId")}/profile`);
      return response.data;
    } catch (error) {
      throw this.apiError("getUserProfile", error);
    }
  }

  /**
   * Compare two mole images
   */
  async compareMoleImages(
    moleId: string,
    imageId1: string,
    imageId2: string
  ): Promise<ImageComparison> {
    if (this.mockMode) return this.getMockComparison();
    try {
      const response = await this.client.post(`/moles/${pathId(moleId, "moleId")}/compare`, {
        imageId1: pathId(imageId1, "imageId1"),
        imageId2: pathId(imageId2, "imageId2"),
      });
      return response.data;
    } catch (error) {
      throw this.apiError("compareMoleImages", error);
    }
  }

  /**
   * A backend failure surfaces as an error the tool runtime turns into an
   * isError result. It never becomes synthetic data: a caller who configured
   * a real backend must not receive plausible-looking records that are not
   * theirs. The message carries the HTTP status, not the response body.
   */
  private apiError(operation: string, error: unknown): Error {
    if (error instanceof Error && !axios.isAxiosError(error)) return error;
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    const reason = status ? `HTTP ${status}` : "the backend could not be reached";
    return new Error(`MoleCare API ${operation} failed: ${reason}`);
  }

  // ==========================================================================
  // MOCK DATA - For development/testing
  // ==========================================================================

  private getMockMoles(userId: string): Mole[] {
    return [
      {
        id: "mole-001",
        bodyPart: "Left Arm",
        nickname: "Arm mole",
        createdAt: "2024-01-15T10:30:00Z",
        lastAnalyzedAt: "2024-12-20T14:00:00Z",
        images: [{}, {}, {}],
      },
      {
        id: "mole-002",
        bodyPart: "Back",
        nickname: "Back mole",
        createdAt: "2024-03-22T09:15:00Z",
        lastAnalyzedAt: "2024-12-18T11:30:00Z",
        images: [{}, {}],
      },
      {
        id: "mole-003",
        bodyPart: "Right Shoulder",
        createdAt: "2024-06-10T16:45:00Z",
        lastAnalyzedAt: "2024-12-15T10:00:00Z",
        images: [{}],
      },
    ];
  }

  private getMockAnalysis(moleId: string): Analysis {
    return {
      date: "2024-12-20T14:00:00Z",
      asymmetryScore: 0.15,
      borderScore: 0.2,
      colorScore: 0.18,
      colorVariations: ["brown", "tan"],
      diameterMm: 4.2,
      evolutionScore: 0.1,
    };
  }

  private getMockHistory(moleId: string): MoleHistory {
    return {
      startDate: "2024-01-15T10:30:00Z",
      imageCount: 5,
      changes: [
        {
          date: "2024-06-15",
          type: "SIZE",
          description: "Slight increase in diameter (+0.3mm)",
        },
        {
          date: "2024-09-20",
          type: "COLOR",
          description: "No significant color change",
        },
      ],
      trend: "STABLE",
    };
  }

  private getMockProfile(userId: string): UserProfile {
    return {
      skinType: 2,
      riskFactors: ["FAIR_SKIN", "OUTDOOR_ACTIVITY"],
    };
  }

  private getMockComparison(): ImageComparison {
    return {
      sizeChangePercent: 5.2,
      colorChange: "No significant change",
      borderChange: "Borders remain well-defined",
      overallChange: "Small recorded differences",
    };
  }
}
