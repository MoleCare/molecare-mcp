/**
 * Mole and profile tools for the public MCP bridge.
 *
 * These talk to the MoleCare API when credentials are set, and return
 * labelled mock records otherwise. They must not emit a clinical verdict.
 */

import type { MoleCareApiClient } from "../api/molecare-client.js";
import {
  EDUCATIONAL_ONLY_NOTE,
  EDUCATIONAL_RISK_NOTE,
  publicComparison,
  publicHistoryChange,
  publicMoleRecord,
} from "../clinical-boundary.js";

export const moleTools = [
  {
    name: "get_user_moles",
    annotations: { readOnlyHint: true, openWorldHint: true },
    description:
      "List a user's recorded moles and last photo dates. Educational records only — not a risk ranking.",
    inputSchema: {
      type: "object" as const,
      properties: {
        userId: {
          type: "string",
          description: "The user's unique identifier",
        },
      },
      required: ["userId"],
    },
  },
  {
    name: "get_mole_analysis",
    annotations: { readOnlyHint: true, openWorldHint: true },
    description:
      "Return recorded ABCDE feature measurements for a mole. Educational only — not a diagnosis or risk level.",
    inputSchema: {
      type: "object" as const,
      properties: {
        moleId: {
          type: "string",
          description: "The mole's unique identifier",
        },
      },
      required: ["moleId"],
    },
  },
  {
    name: "get_mole_changes",
    annotations: { readOnlyHint: true, openWorldHint: true },
    description:
      "Return recorded appearance changes for a mole over time. Observations only — not a trend verdict.",
    inputSchema: {
      type: "object" as const,
      properties: {
        moleId: {
          type: "string",
          description: "The mole's unique identifier",
        },
      },
      required: ["moleId"],
    },
  },
  {
    name: "get_user_risk_factors",
    annotations: { readOnlyHint: true, openWorldHint: true },
    description:
      "List named educational skin-health factors on a user profile. Does not calculate a risk score.",
    inputSchema: {
      type: "object" as const,
      properties: {
        userId: {
          type: "string",
          description: "The user's unique identifier",
        },
      },
      required: ["userId"],
    },
  },
  {
    name: "compare_moles",
    annotations: { readOnlyHint: true, openWorldHint: true },
    description:
      "Compare two recorded mole photos. Reports observed differences only — not a diagnosis.",
    inputSchema: {
      type: "object" as const,
      properties: {
        moleId: {
          type: "string",
          description: "The mole's unique identifier",
        },
        imageId1: {
          type: "string",
          description: "First image ID (older)",
        },
        imageId2: {
          type: "string",
          description: "Second image ID (newer)",
        },
      },
      required: ["moleId", "imageId1", "imageId2"],
    },
  },
];

export const moleToolCosts: Record<string, number> = {
  get_user_moles: 2,
  get_mole_analysis: 3,
  get_mole_changes: 2,
  get_user_risk_factors: 2,
  compare_moles: 5,
};

/** First four mole tools sit before search_medical_info in the public list. */
export const moleToolsBeforeSearch = moleTools.slice(0, 4);
export const compareMolesTool = moleTools[4];

export async function dispatchMoleTool(
  apiClient: MoleCareApiClient,
  name: string,
  args: Record<string, unknown>
) {
  switch (name) {
    case "get_user_moles": {
      const moles = await apiClient.getUserMoles(args.userId as string);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                userId: args.userId,
                totalMoles: moles.length,
                moles: moles.map((m) => publicMoleRecord(m)),
                disclaimer: EDUCATIONAL_ONLY_NOTE,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "get_mole_analysis": {
      const analysis = await apiClient.getMoleAnalysis(args.moleId as string);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                moleId: args.moleId,
                analysisDate: analysis.date,
                abcdeScores: {
                  asymmetry: {
                    score: analysis.asymmetryScore,
                    description: getAsymmetryDescription(analysis.asymmetryScore),
                  },
                  border: {
                    score: analysis.borderScore,
                    description: getBorderDescription(analysis.borderScore),
                  },
                  color: {
                    score: analysis.colorScore,
                    variations: analysis.colorVariations,
                    description: getColorDescription(analysis.colorScore),
                  },
                  diameter: {
                    mm: analysis.diameterMm,
                    description: getDiameterDescription(analysis.diameterMm),
                  },
                  evolution: {
                    score: analysis.evolutionScore,
                    description: getEvolutionDescription(analysis.evolutionScore),
                  },
                },
                disclaimer: EDUCATIONAL_ONLY_NOTE,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "get_mole_changes": {
      const history = await apiClient.getMoleHistory(args.moleId as string);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                moleId: args.moleId,
                trackingStarted: history.startDate,
                totalImages: history.imageCount,
                changes: Array.isArray(history.changes)
                  ? history.changes.map((c: { date?: string; type?: string; description?: string }) =>
                      publicHistoryChange(c)
                    )
                  : [],
                trend: history.trend,
                trendDescription: getTrendDescription(history.trend),
                disclaimer: EDUCATIONAL_ONLY_NOTE,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "get_user_risk_factors": {
      const profile = await apiClient.getUserProfile(args.userId as string);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                userId: args.userId,
                skinType: profile.skinType,
                riskFactors: profile.riskFactors,
                notes: getPersonalizedRecommendations(profile),
                note: EDUCATIONAL_RISK_NOTE,
                disclaimer: EDUCATIONAL_ONLY_NOTE,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "compare_moles": {
      const comparison = await apiClient.compareMoleImages(
        args.moleId as string,
        args.imageId1 as string,
        args.imageId2 as string
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                moleId: args.moleId,
                comparison: publicComparison({
                  sizeChangePercent: comparison.sizeChangePercent,
                  colorChange: comparison.colorChange,
                  borderChange: comparison.borderChange,
                  overallChange: comparison.overallChange,
                }),
                disclaimer: EDUCATIONAL_ONLY_NOTE,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    default:
      return undefined;
  }
}

function getAsymmetryDescription(score: number): string {
  if (score < 0.3) return "Symmetric - both halves match well";
  if (score < 0.6) return "Slightly asymmetric - minor differences between halves";
  return "Asymmetric - significant differences between halves";
}

function getBorderDescription(score: number): string {
  if (score < 0.3) return "Smooth, well-defined border";
  if (score < 0.6) return "Slightly irregular border";
  return "Irregular, ragged, or blurred border";
}

function getColorDescription(score: number): string {
  if (score < 0.3) return "Uniform color throughout";
  if (score < 0.6) return "Some color variation present";
  return "Multiple colors or significant variation";
}

function getDiameterDescription(diameter: number): string {
  if (diameter < 6) return `${diameter}mm — smaller than about 6 mm (pencil eraser size)`;
  return `${diameter}mm — larger than about 6 mm (pencil eraser size)`;
}

function getEvolutionDescription(score: number): string {
  if (score < 0.3) return "Little recorded change over the comparison window";
  if (score < 0.6) return "Some recorded change over the comparison window";
  return "Larger recorded change over the comparison window";
}

function getTrendDescription(trend: string): string {
  switch (trend) {
    case "STABLE":
      return "Recorded appearance has stayed similar across the comparison window.";
    case "SLIGHT_CHANGE":
      return "Small recorded differences across the comparison window.";
    case "SIGNIFICANT_CHANGE":
      return "Larger recorded differences across the comparison window.";
    case "RAPID_CHANGE":
      return "Faster recorded change across the comparison window.";
    default:
      return "Trend data not available.";
  }
}

function getPersonalizedRecommendations(profile: {
  skinType?: number;
  riskFactors?: string[];
}): string[] {
  const recommendations: string[] = [];

  if ((profile.skinType ?? 0) <= 2) {
    recommendations.push(
      "Fairer skin types are often more sensitive to UV. Educational materials commonly mention daily sun protection."
    );
  }

  if (profile.riskFactors?.includes("FAMILY_HISTORY")) {
    recommendations.push(
      "Family history is a named educational factor. It does not mean a condition will develop."
    );
  }

  if (profile.riskFactors?.includes("MANY_MOLES")) {
    recommendations.push(
      "Having many moles is a named educational factor. Recording appearance over time is a common self-check habit."
    );
  }

  recommendations.push("Take photos of moles monthly to track any changes over time.");

  return recommendations;
}
