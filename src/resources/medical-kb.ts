/**
 * Medical Knowledge Base
 * =======================
 *
 * Contains educational information about skin health, mole analysis,
 * and cancer prevention. This is NOT medical advice - always recommend
 * users consult healthcare professionals.
 */

interface KnowledgeEntry {
  term: string;
  definition: string;
  details: string;
  significance: string;
  examples?: string[];
  /**
   * Extra search terms that a user is likely to type but that do not appear
   * in the prose above: acronyms, British spellings, and common synonyms.
   */
  keywords?: string[];
}

interface Resource {
  title: string;
  content: any;
  disclaimer: string;
}

const KNOWLEDGE_BASE: Record<string, KnowledgeEntry> = {
  asymmetry: {
    term: "Asymmetry",
    keywords: ["abcde", "symmetry", "shape", "uneven"],
    definition: "When one half of a mole does not match the other half",
    details:
      "Benign moles are typically symmetric. If you draw a line through the middle, both halves should look similar. Asymmetry can be a warning sign that should be monitored.",
    significance:
      "Asymmetry is the 'A' in the ABCDE rule for melanoma detection. Significant asymmetry warrants professional evaluation.",
    examples: [
      "One side larger than the other",
      "Uneven shape",
      "Different texture on each half",
    ],
  },

  border: {
    term: "Border",
    keywords: ["abcde", "edge", "edges", "outline", "margin"],
    definition: "The edges or outline of a mole",
    details:
      "Healthy moles typically have smooth, even borders. Irregular, ragged, notched, or blurred borders can be concerning and should be monitored.",
    significance:
      "Border irregularity is the 'B' in the ABCDE rule. Borders that are poorly defined or spread into surrounding skin need attention.",
    examples: [
      "Scalloped edges",
      "Notched border",
      "Blurry or undefined edges",
    ],
  },

  color: {
    term: "Color",
    keywords: ["abcde", "colour", "pigment", "pigmentation"],
    definition: "The pigmentation within a mole",
    details:
      "Most benign moles are a single shade of brown. Multiple colors or uneven distribution of color can be a warning sign. Watch for shades of black, red, white, or blue.",
    significance:
      "Color variation is the 'C' in the ABCDE rule. Multiple colors in one mole, especially unusual colors, should be evaluated.",
    examples: [
      "Multiple shades of brown",
      "Areas of black pigment",
      "Red, white, or blue areas",
    ],
  },

  diameter: {
    term: "Diameter",
    keywords: ["abcde", "size", "width", "6mm", "large"],
    definition: "The size of a mole measured across its widest point",
    details:
      "Melanomas are often larger than 6mm (about the size of a pencil eraser) when diagnosed. However, they can be smaller when first detected.",
    significance:
      "Diameter is the 'D' in the ABCDE rule. Moles larger than 6mm should be monitored closely, though size alone is not diagnostic.",
    examples: [
      "Mole larger than a pencil eraser",
      "Growing mole",
      "Mole that was small but has increased in size",
    ],
  },

  evolution: {
    term: "Evolution",
    keywords: ["abcde", "change", "changing", "evolving", "growth"],
    definition: "Changes in a mole over time",
    details:
      "Any change in a mole's size, shape, color, elevation, or any new symptom such as bleeding, itching, or crusting can be significant.",
    significance:
      "Evolution is the 'E' in the ABCDE rule and is considered one of the most important warning signs. Any changing mole should be evaluated.",
    examples: [
      "Mole that has grown",
      "Change in color over months",
      "New symptoms like itching",
      "Bleeding without injury",
    ],
  },

  melanoma: {
    term: "Melanoma",
    keywords: ["skin cancer", "cancer", "malignant", "tumour", "tumor"],
    definition:
      "A type of skin cancer that develops from the cells that give skin its color",
    details:
      "Melanoma is the most serious type of skin cancer. It develops when the pigment-producing cells (melanocytes) mutate and become cancerous. Early detection is crucial for successful treatment.",
    significance:
      "When detected early, melanoma is highly treatable. Regular skin self-exams and professional screenings are important for early detection.",
    examples: [
      "New, unusual growth",
      "Existing mole that changes",
      "Sore that doesn't heal",
    ],
  },

  "skin-types": {
    term: "Fitzpatrick Skin Types",
    keywords: ["fitzpatrick", "skin type", "phototype", "burns"],
    definition: "A classification system for skin based on its response to sun exposure",
    details:
      "Type I: Very fair, always burns. Type II: Fair, usually burns. Type III: Medium, sometimes burns. Type IV: Olive, rarely burns. Type V: Brown, very rarely burns. Type VI: Dark brown/black, never burns.",
    significance:
      "People with lighter skin types (I-II) have higher risk of sun damage and skin cancer. All skin types need sun protection.",
    examples: [],
  },

  sunscreen: {
    term: "Sunscreen",
    keywords: ["spf", "sunblock", "suncream", "sun cream", "sun protection"],
    definition: "A product that protects skin from UV radiation damage",
    details:
      "SPF (Sun Protection Factor) indicates protection against UVB rays. Broad-spectrum sunscreens also protect against UVA rays. Apply generously 15-30 minutes before sun exposure.",
    significance:
      "Regular sunscreen use significantly reduces risk of skin cancer. SPF 30 or higher is recommended for extended outdoor activity.",
    examples: [
      "SPF 30+ for daily use",
      "SPF 50+ for extended outdoor activity",
      "Water-resistant for swimming",
    ],
  },

  "self-examination": {
    term: "Skin Self-Examination",
    keywords: ["self exam", "self-check", "mole check", "screening"],
    definition: "Regular checking of your own skin for new or changing moles",
    details:
      "Perform monthly self-exams. Use mirrors to check hard-to-see areas. Pay attention to any new moles or changes in existing ones. Document with photos.",
    significance:
      "Regular self-exams help detect skin cancer early when it's most treatable. Know your skin and report any concerns to your doctor.",
    examples: [
      "Check all skin including between toes",
      "Use a mirror for back examination",
      "Note location of all moles",
    ],
  },

  "uv-protection": {
    term: "UV Protection",
    keywords: ["uv", "ultraviolet", "sun safety", "shade", "sun protection"],
    definition: "Methods to protect skin from ultraviolet radiation",
    details:
      "UV protection includes sunscreen, protective clothing, seeking shade, and avoiding peak sun hours (10am-4pm). UV exposure is cumulative over lifetime.",
    significance:
      "UV radiation is the primary cause of skin cancer. Consistent protection is essential regardless of weather or season.",
    examples: [
      "Wear broad-brimmed hats",
      "Use UV-protective clothing",
      "Wear sunglasses",
    ],
  },
};

const RESOURCES: Record<string, Resource> = {
  "molecare://knowledge/abcde-criteria": {
    title: "ABCDE Criteria for Melanoma Detection",
    content: {
      overview:
        "The ABCDE rule is a helpful guide for identifying potentially cancerous moles.",
      criteria: [
        {
          letter: "A",
          name: "Asymmetry",
          description: "One half doesn't match the other",
          what_to_look_for: "Draw an imaginary line through the mole - do both halves match?",
        },
        {
          letter: "B",
          name: "Border",
          description: "Irregular, ragged, or blurred edges",
          what_to_look_for: "Are the edges smooth and even, or irregular and notched?",
        },
        {
          letter: "C",
          name: "Color",
          description: "Uneven color or multiple colors",
          what_to_look_for: "Is it one uniform color, or are there multiple shades or colors?",
        },
        {
          letter: "D",
          name: "Diameter",
          description: "Larger than 6mm (pencil eraser size)",
          what_to_look_for: "Is it larger than a pencil eraser? Has it grown?",
        },
        {
          letter: "E",
          name: "Evolution",
          description: "Changing in size, shape, or color",
          what_to_look_for: "Has the mole changed in any way over time?",
        },
      ],
      important_note:
        "Not all melanomas follow these rules, and not all moles with these features are cancerous. When in doubt, consult a dermatologist.",
    },
    disclaimer:
      "This information is for educational purposes only and does not constitute medical advice.",
  },

  "molecare://knowledge/skin-types": {
    title: "Fitzpatrick Skin Type Classification",
    content: {
      overview:
        "The Fitzpatrick scale classifies skin types based on response to UV exposure.",
      types: [
        {
          type: 1,
          description: "Very fair skin, light eyes, freckles",
          sunResponse: "Always burns, never tans",
          riskLevel: "Highest risk of sun damage",
        },
        {
          type: 2,
          description: "Fair skin, light eyes",
          sunResponse: "Usually burns, tans minimally",
          riskLevel: "High risk of sun damage",
        },
        {
          type: 3,
          description: "Medium skin tone",
          sunResponse: "Sometimes burns, tans gradually",
          riskLevel: "Moderate risk of sun damage",
        },
        {
          type: 4,
          description: "Olive skin tone",
          sunResponse: "Rarely burns, tans easily",
          riskLevel: "Lower risk, still needs protection",
        },
        {
          type: 5,
          description: "Brown skin tone",
          sunResponse: "Very rarely burns, tans very easily",
          riskLevel: "Lower risk, still needs protection",
        },
        {
          type: 6,
          description: "Dark brown to black skin",
          sunResponse: "Never burns",
          riskLevel: "Lowest risk, but still possible",
        },
      ],
      recommendation:
        "All skin types benefit from sun protection. Lighter skin types need extra vigilance.",
    },
    disclaimer:
      "This information is for educational purposes only and does not constitute medical advice.",
  },

  "molecare://knowledge/prevention-tips": {
    title: "Skin Cancer Prevention Tips",
    content: {
      dailyHabits: [
        "Apply broad-spectrum SPF 30+ sunscreen daily, even on cloudy days",
        "Reapply sunscreen every 2 hours when outdoors",
        "Wear protective clothing, including wide-brimmed hats",
        "Seek shade during peak UV hours (10am-4pm)",
        "Wear UV-blocking sunglasses",
      ],
      selfExamination: [
        "Perform monthly skin self-exams",
        "Use mirrors to check hard-to-see areas",
        "Take photos of moles to track changes",
        "Note any new moles or changes in existing ones",
        "Check skin from head to toe, including scalp and between toes",
      ],
      professionalCare: [
        "Schedule annual skin exams with a dermatologist",
        "More frequent exams if you have risk factors",
        "Report any concerning changes immediately",
        "Don't wait for symptoms to worsen",
      ],
      thingsToAvoid: [
        "Avoid tanning beds and sunlamps",
        "Don't stay in the sun until you burn",
        "Avoid peak sun exposure without protection",
        "Don't ignore changing moles",
      ],
    },
    disclaimer:
      "This information is for educational purposes only and does not constitute medical advice.",
  },

  "molecare://knowledge/when-to-see-doctor": {
    title: "When to See a Dermatologist",
    content: {
      seeImmediately: [
        "A mole that is rapidly changing",
        "A mole that bleeds without injury",
        "A new, rapidly growing lesion",
        "A sore that doesn't heal within 3 weeks",
        "Any mole with high-risk ABCDE features",
      ],
      scheduleAppointment: [
        "Any new mole after age 30",
        "A mole that looks different from your other moles",
        "Gradual changes in an existing mole",
        "Family history of melanoma",
        "Personal history of skin cancer",
        "Many moles (50+)",
        "History of blistering sunburns",
      ],
      routineScreening: [
        "Annual skin exam for everyone",
        "More frequent for high-risk individuals",
        "After finding any suspicious mole",
        "If you work outdoors frequently",
      ],
      whatToExpect:
        "A dermatologist will examine your skin, possibly using a dermatoscope (magnifying device). They may photograph moles for monitoring or perform a biopsy if needed.",
    },
    disclaimer:
      "This information is for educational purposes only and does not constitute medical advice. When in doubt, always consult a healthcare professional.",
  },
};

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
  const keywords = (entry.keywords || []).map((k) => k.toLowerCase());
  const name = `${key.replace(/-/g, " ")} ${entry.term}`.toLowerCase();

  // An exact hit on the entry's name or one of its synonyms wins outright.
  let score = 0;
  if (name.split(" ").includes(query) || entry.term.toLowerCase() === query || keywords.includes(query)) {
    score += 100;
  }

  const fields: Array<[string, number]> = [
    [name, 10],
    [keywords.join(" "), 8],
    [entry.definition.toLowerCase(), 4],
    [
      `${entry.details} ${entry.significance} ${(entry.examples || []).join(" ")}`.toLowerCase(),
      2,
    ],
  ];

  const words = query.split(/\s+/).filter((w) => w.length > 2);

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
  /**
   * Search the knowledge base for relevant information
   */
  search(query: string): KnowledgeEntry[] {
    const normalizedQuery = query.toLowerCase().trim();
    if (!normalizedQuery) return [];

    const scored = Object.entries(KNOWLEDGE_BASE)
      .map(([key, entry]) => ({ entry, score: scoreEntry(key, entry, normalizedQuery) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);

    // `keywords` is search plumbing, not medical content - keep it out of the
    // response so the tool's output shape is unchanged.
    return scored.slice(0, 5).map(({ entry: { keywords, ...entry } }) => entry);
  }

  /**
   * Get a specific resource by URI
   */
  getResource(uri: string): Resource | null {
    return RESOURCES[uri] || null;
  }

  /**
   * Get all available resource URIs
   */
  listResources(): string[] {
    return Object.keys(RESOURCES);
  }
}
