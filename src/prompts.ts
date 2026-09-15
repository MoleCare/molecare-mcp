import { EDUCATIONAL_ONLY_NOTE } from "./clinical-boundary.js";

export const MEDICAL_PROMPTS = [
  {
    name: "walk_through_abcde",
    description: "Describe the ABCDE criteria for a lesion without diagnosing it.",
    arguments: [
      { name: "description", description: "Optional plain-language description to organize", required: false },
    ],
  },
  {
    name: "prepare_dermatology_appointment",
    description: "Organize observations and questions for a dermatology appointment.",
    arguments: [
      { name: "notes", description: "Optional notes about what changed and when", required: false },
    ],
  },
  {
    name: "explain_snomed_code",
    description: "Explain a SNOMED CT code in plain educational language.",
    arguments: [{ name: "code", description: "SNOMED CT code to explain", required: true }],
  },
] as const;

const DISCLAIMER = `\n\n${EDUCATIONAL_ONLY_NOTE}`;

export function renderMedicalPrompt(
  name: string,
  args: Record<string, string> = {},
): { description: string; text: string } | null {
  switch (name) {
    case "walk_through_abcde":
      return {
        description: "An educational ABCDE walkthrough",
        text: `Walk through the ABCDE criteria (asymmetry, border, colour, diameter, and evolution) using the bundled knowledge resources. Organize observations from the user's description${args.description ? `: ${args.description}` : ""}. Explain that these are features clinicians assess; do not identify a condition, assign risk, or recommend urgency.${DISCLAIMER}`,
      };
    case "prepare_dermatology_appointment":
      return {
        description: "A non-diagnostic appointment preparation checklist",
        text: `Help the user prepare factual notes and questions for a dermatology appointment. Include when the observation began, what changed, symptoms they noticed, relevant personal or family history, medicines, and questions for the clinician${args.notes ? `. Start from these notes: ${args.notes}` : ""}. Do not interpret the notes, assign urgency, or suggest a diagnosis.${DISCLAIMER}`,
      };
    case "explain_snomed_code":
      if (!args.code?.trim()) return null;
      return {
        description: "A plain-language terminology explanation",
        text: `Use the lookup_medical_concept tool to explain SNOMED CT code ${args.code} in plain language, including its terminology category and any bundled educational mapping. Do not infer a diagnosis from a code, add a risk or urgency judgment, or recommend treatment.${DISCLAIMER}`,
      };
    default:
      return null;
  }
}
