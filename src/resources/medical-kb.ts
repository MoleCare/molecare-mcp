/**
 * Medical Knowledge Base
 * =======================
 *
 * Contains educational information about skin health, mole analysis,
 * and cancer prevention. This is NOT medical advice - always recommend
 * users consult healthcare professionals.
 *
 * English copy lives in `locales/en/medical-kb.json`. Keeping the copy out of
 * this module lets contributors add translations without changing runtime
 * code, while the schema below makes an incomplete locale fail clearly.
 *
 * Clinical terminology (SNOMED CT concepts, ICD-10 codes, and mappings)
 * lives in `src/api/ontology-client.ts` and the `molecare://ontology/*`
 * resources — see `terminology-provenance.ts` for named, dated sources.
 */

import { readFileSync } from "node:fs";

import { z } from "zod";

const nonEmptyText = z.string().min(1).refine((value) => value.trim().length > 0, {
  message: "Text must contain a non-whitespace character",
});
const textList = z.array(nonEmptyText);

const knowledgeEntrySchema = z.strictObject({
  term: nonEmptyText,
  keywords: textList.min(1),
  definition: nonEmptyText,
  details: nonEmptyText,
  significance: nonEmptyText,
  examples: textList,
});

function knowledgeEntryWithExamples(count: number) {
  return knowledgeEntrySchema.extend({ examples: textList.length(count) });
}

const knowledgeBaseSchema = z.strictObject({
  asymmetry: knowledgeEntryWithExamples(3),
  border: knowledgeEntryWithExamples(3),
  color: knowledgeEntryWithExamples(3),
  diameter: knowledgeEntryWithExamples(3),
  evolution: knowledgeEntryWithExamples(4),
  melanoma: knowledgeEntryWithExamples(3),
  "skin-types": knowledgeEntryWithExamples(0),
  sunscreen: knowledgeEntryWithExamples(3),
  "self-examination": knowledgeEntryWithExamples(3),
  "uv-protection": knowledgeEntryWithExamples(3),
});

const disclaimersSchema = z.strictObject({
  educationalOnly: nonEmptyText,
  educationalOnlyWithConsult: nonEmptyText,
  educationalOnlyPleaseConsult: nonEmptyText,
});

const resourceFields = {
  name: nonEmptyText,
  description: nonEmptyText,
  title: nonEmptyText,
};

function abcdeCriterionSchema(letter: "A" | "B" | "C" | "D" | "E") {
  return z.strictObject({
    letter: z.literal(letter),
    name: nonEmptyText,
    description: nonEmptyText,
    what_to_look_for: nonEmptyText,
  });
}

function skinTypeSchema(type: 1 | 2 | 3 | 4 | 5 | 6) {
  return z.strictObject({
    type: z.literal(type),
    description: nonEmptyText,
    sunResponse: nonEmptyText,
    riskLevel: nonEmptyText,
  });
}

const resourcesSchema = z.strictObject({
  "molecare://knowledge/abcde-criteria": z.strictObject({
    ...resourceFields,
    content: z.strictObject({
      overview: nonEmptyText,
      criteria: z.tuple([
        abcdeCriterionSchema("A"),
        abcdeCriterionSchema("B"),
        abcdeCriterionSchema("C"),
        abcdeCriterionSchema("D"),
        abcdeCriterionSchema("E"),
      ]),
      important_note: nonEmptyText,
    }),
    disclaimerKey: z.literal("educationalOnly"),
  }),
  "molecare://knowledge/skin-types": z.strictObject({
    ...resourceFields,
    content: z.strictObject({
      overview: nonEmptyText,
      types: z.tuple([
        skinTypeSchema(1),
        skinTypeSchema(2),
        skinTypeSchema(3),
        skinTypeSchema(4),
        skinTypeSchema(5),
        skinTypeSchema(6),
      ]),
      recommendation: nonEmptyText,
    }),
    disclaimerKey: z.literal("educationalOnly"),
  }),
  "molecare://knowledge/prevention-tips": z.strictObject({
    ...resourceFields,
    content: z.strictObject({
      dailyHabits: textList.length(5),
      selfExamination: textList.length(5),
      professionalCare: textList.length(4),
      thingsToAvoid: textList.length(4),
    }),
    disclaimerKey: z.literal("educationalOnly"),
  }),
  "molecare://knowledge/when-to-see-doctor": z.strictObject({
    ...resourceFields,
    content: z.strictObject({
      seeImmediately: textList.length(5),
      scheduleAppointment: textList.length(7),
      routineScreening: textList.length(4),
      whatToExpect: nonEmptyText,
    }),
    disclaimerKey: z.literal("educationalOnlyWithConsult"),
  }),
});

/** Runtime schema shared by startup loading and locale completeness tests. */
export const medicalKnowledgeLocaleSchema = z.strictObject({
  knowledgeBase: knowledgeBaseSchema,
  disclaimers: disclaimersSchema,
  resources: resourcesSchema,
});

export type MedicalKnowledgeLocale = z.infer<typeof medicalKnowledgeLocaleSchema>;
export type KnowledgeEntry = z.infer<typeof knowledgeEntrySchema>;
export type DisclaimerKey = keyof MedicalKnowledgeLocale["disclaimers"];

export interface Resource {
  title: string;
  content: Record<string, unknown>;
  disclaimer: string;
}

export interface ResourceMetadata {
  uri: string;
  name: string;
  description: string;
  mimeType: "application/json";
}

type LocalizedResource = MedicalKnowledgeLocale["resources"][keyof MedicalKnowledgeLocale["resources"]];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Validate parsed locale data and report every missing or malformed path. */
export function parseMedicalKnowledgeLocale(
  value: unknown,
  locale = "unknown"
): MedicalKnowledgeLocale {
  const result = medicalKnowledgeLocaleSchema.safeParse(value);
  if (result.success) return result.data;

  const details = result.error.issues
    .map((issue) => {
      const path = issue.path.length ? issue.path.map(String).join(".") : "<root>";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
  throw new Error(`Invalid medical knowledge locale \"${locale}\": ${details}`);
}

/**
 * Load a locale beside the package's compiled output.
 *
 * `src/resources` and `dist/resources` have the same depth, so this URL works
 * during `npm run dev`, from a built checkout, and from an installed package.
 */
export function loadMedicalKnowledgeLocale(locale = "en"): MedicalKnowledgeLocale {
  if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale)) {
    throw new Error(`Invalid medical knowledge locale identifier: ${locale}`);
  }

  const localeUrl = new URL(`../../locales/${locale}/medical-kb.json`, import.meta.url);
  let source: string;
  try {
    source = readFileSync(localeUrl, "utf8");
  } catch (error) {
    throw new Error(
      `Unable to read medical knowledge locale \"${locale}\": ${errorMessage(error)}`,
      { cause: error }
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new Error(
      `Unable to parse medical knowledge locale \"${locale}\": ${errorMessage(error)}`,
      { cause: error }
    );
  }

  return parseMedicalKnowledgeLocale(value, locale);
}

/**
 * Rank an entry against a query.
 *
 * Fields are weighted so that a name match beats a passing mention in the
 * prose: searching "melanoma" should return the Melanoma entry, not whichever
 * ABCDE criterion happens to mention melanoma first. Every field is searched,
 * including `significance` and `examples` — leaving `significance` out was why
 * "ABCDE" returned nothing, since that is the only field naming the acronym.
 */
function scoreEntry(key: string, entry: KnowledgeEntry, query: string): number {
  const keywords = entry.keywords.map((keyword) => keyword.toLowerCase());
  const name = `${key.replace(/-/g, " ")} ${entry.term}`.toLowerCase();

  // An exact hit on the entry's name or one of its synonyms wins outright.
  let score = 0;
  if (
    name.split(" ").includes(query) ||
    entry.term.toLowerCase() === query ||
    keywords.includes(query)
  ) {
    score += 100;
  }

  const fields: Array<[string, number]> = [
    [name, 10],
    [keywords.join(" "), 8],
    [entry.definition.toLowerCase(), 4],
    [
      `${entry.details} ${entry.significance} ${entry.examples.join(" ")}`.toLowerCase(),
      2,
    ],
  ];

  const words = query.split(/\s+/).filter((word) => word.length > 2);

  for (const [text, weight] of fields) {
    if (!text) continue;
    if (text.includes(query)) score += weight * 2; // whole phrase
    for (const word of words) {
      if (text.includes(word)) score += weight;
    }
  }

  return score;
}

export class MedicalKnowledgeBase {
  private readonly knowledgeBase: Record<string, KnowledgeEntry>;
  private readonly resources: Record<string, LocalizedResource>;
  private readonly disclaimers: MedicalKnowledgeLocale["disclaimers"];

  constructor(locale: MedicalKnowledgeLocale = loadMedicalKnowledgeLocale("en")) {
    this.knowledgeBase = locale.knowledgeBase;
    this.resources = locale.resources;
    this.disclaimers = locale.disclaimers;
  }

  /** Search the knowledge base for relevant information. */
  search(query: string): Array<Omit<KnowledgeEntry, "keywords">> {
    const normalizedQuery = query.toLowerCase().trim();
    if (!normalizedQuery) return [];

    const scored = Object.entries(this.knowledgeBase)
      .map(([key, entry]) => ({ entry, score: scoreEntry(key, entry, normalizedQuery) }))
      .filter((result) => result.score > 0)
      .sort((left, right) => right.score - left.score);

    // `keywords` is search plumbing, not medical content - keep it out of the
    // response so the tool's output shape is unchanged.
    return scored.slice(0, 5).map(({ entry: { keywords, ...entry } }) => entry);
  }

  /** Return an approved locale disclaimer by its stable purpose key. */
  getDisclaimer(key: DisclaimerKey): string {
    return this.disclaimers[key];
  }

  /** Get a specific resource by URI without exposing locale plumbing. */
  getResource(uri: string): Resource | null {
    const resource = this.resources[uri];
    if (!resource) return null;
    return {
      title: resource.title,
      content: resource.content,
      disclaimer: this.getDisclaimer(resource.disclaimerKey),
    };
  }

  /** Get all available resource URIs. */
  listResources(): string[] {
    return Object.keys(this.resources);
  }

  /** Get localized MCP listing metadata for every knowledge resource. */
  listResourceMetadata(): ResourceMetadata[] {
    return Object.entries(this.resources).map(([uri, resource]) => ({
      uri,
      name: resource.name,
      description: resource.description,
      mimeType: "application/json",
    }));
  }
}
