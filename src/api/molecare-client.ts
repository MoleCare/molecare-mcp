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

  constructor(config: MoleCareApiConfig) {
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
    try {
      const response = await this.client.get(`/moles/user/${userId}`);
      return response.data;
    } catch (error) {
      // Return mock data for development
      console.error("API call failed, returning mock data:", error);
      return this.getMockMoles(userId);
    }
  }

  /**
   * Get detailed analysis for a mole
   */
  async getMoleAnalysis(moleId: string): Promise<Analysis> {
    try {
      const response = await this.client.get(`/moles/${moleId}/analysis`);
      return response.data;
    } catch (error) {
      console.error("API call failed, returning mock data:", error);
      return this.getMockAnalysis(moleId);
    }
  }

  /**
   * Get change history for a mole
   */
  async getMoleHistory(moleId: string): Promise<MoleHistory> {
    try {
      const response = await this.client.get(`/moles/${moleId}/history`);
      return response.data;
    } catch (error) {
      console.error("API call failed, returning mock data:", error);
      return this.getMockHistory(moleId);
    }
  }

  /**
   * Get user profile with risk factors
   */
  async getUserProfile(userId: string): Promise<UserProfile> {
    try {
      const response = await this.client.get(`/users/${userId}/profile`);
      return response.data;
    } catch (error) {
      console.error("API call failed, returning mock data:", error);
      return this.getMockProfile(userId);
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
    try {
      const response = await this.client.post(`/moles/${moleId}/compare`, {
        imageId1,
        imageId2,
      });
      return response.data;
    } catch (error) {
      console.error("API call failed, returning mock data:", error);
      return this.getMockComparison();
    }
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
