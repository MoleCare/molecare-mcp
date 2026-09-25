import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

import {
  MedicalKnowledgeBase,
  loadMedicalKnowledgeLocale,
  parseMedicalKnowledgeLocale,
} from "../dist/resources/medical-kb.js";
import { dispatchKnowledgeTool } from "../dist/tools/knowledge.js";

const localeUrl = new URL("../locales/en/medical-kb.json", import.meta.url);
const english = JSON.parse(readFileSync(localeUrl, "utf8"));

const KNOWLEDGE_RESOURCE_URIS = [
  "molecare://knowledge/abcde-criteria",
  "molecare://knowledge/skin-types",
  "molecare://knowledge/prevention-tips",
  "molecare://knowledge/when-to-see-doctor",
];

test("English medical knowledge locale is complete and is the runtime default", () => {
  const loaded = loadMedicalKnowledgeLocale();
  assert.deepEqual(loaded, english);

  const knowledgeBase = new MedicalKnowledgeBase();
  assert.deepEqual(knowledgeBase.listResources(), KNOWLEDGE_RESOURCE_URIS);
  for (const key of Object.keys(english.disclaimers)) {
    assert.equal(knowledgeBase.getDisclaimer(key), english.disclaimers[key]);
  }
  assert.match(english.disclaimers.educationalOnly, /educational purposes only/i);
  assert.match(english.disclaimers.educationalOnly, /does not constitute medical advice/i);

  const metadata = knowledgeBase.listResourceMetadata();
  assert.deepEqual(
    metadata.map((resource) => resource.uri),
    KNOWLEDGE_RESOURCE_URIS,
  );

  for (const item of metadata) {
    const localized = english.resources[item.uri];
    assert.equal(item.name, localized.name);
    assert.equal(item.description, localized.description);
    assert.equal(item.mimeType, "application/json");

    const resource = knowledgeBase.getResource(item.uri);
    assert.deepEqual(Object.keys(resource).sort(), ["content", "disclaimer", "title"]);
    assert.equal(resource.title, localized.title);
    assert.deepEqual(resource.content, localized.content);
    assert.equal(resource.disclaimer, english.disclaimers[localized.disclaimerKey]);
  }

  const [asymmetry] = knowledgeBase.search("asymmetry");
  assert.equal(asymmetry.term, english.knowledgeBase.asymmetry.term);
  assert.equal("keywords" in asymmetry, false, "search-only keywords leaked into the response");
});

test("every shipped medical knowledge locale has the complete English shape", () => {
  const localesUrl = new URL("../locales/", import.meta.url);
  const localeNames = readdirSync(localesUrl, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  assert.ok(localeNames.includes("en"), "the required English locale is missing");
  for (const locale of localeNames) {
    assert.doesNotThrow(
      () => loadMedicalKnowledgeLocale(locale),
      `${locale} is not a loadable, complete medical knowledge locale`,
    );
  }
});

test("search_medical_info uses the canonical locale disclaimer", async () => {
  const result = await dispatchKnowledgeTool(
    {},
    new MedicalKnowledgeBase(),
    "search_medical_info",
    { query: "ABCDE" },
  );
  const payload = JSON.parse(result.content[0].text);
  assert.equal(payload.disclaimer, english.disclaimers.educationalOnlyPleaseConsult);
});

test("locale validation rejects every kind of missing required key", () => {
  const cases = [
    {
      name: "knowledge entry",
      expectedPath: /knowledgeBase\.asymmetry/,
      remove(locale) {
        delete locale.knowledgeBase.asymmetry;
      },
    },
    {
      name: "knowledge entry field",
      expectedPath: /knowledgeBase\.border\.definition/,
      remove(locale) {
        delete locale.knowledgeBase.border.definition;
      },
    },
    {
      name: "canonical disclaimer",
      expectedPath: /disclaimers\.educationalOnly/,
      remove(locale) {
        delete locale.disclaimers.educationalOnly;
      },
    },
    {
      name: "resource",
      expectedPath: /resources\.molecare:\/\/knowledge\/skin-types/,
      remove(locale) {
        delete locale.resources["molecare://knowledge/skin-types"];
      },
    },
    {
      name: "resource listing metadata",
      expectedPath: /resources\.molecare:\/\/knowledge\/prevention-tips\.description/,
      remove(locale) {
        delete locale.resources["molecare://knowledge/prevention-tips"].description;
      },
    },
    {
      name: "nested resource copy",
      expectedPath: /criteria\.0\.what_to_look_for/,
      remove(locale) {
        delete locale.resources["molecare://knowledge/abcde-criteria"].content.criteria[0]
          .what_to_look_for;
      },
    },
    {
      name: "resource disclaimer reference",
      expectedPath: /resources\.molecare:\/\/knowledge\/when-to-see-doctor\.disclaimerKey/,
      remove(locale) {
        delete locale.resources["molecare://knowledge/when-to-see-doctor"].disclaimerKey;
      },
    },
  ];

  for (const fixture of cases) {
    const incomplete = structuredClone(english);
    fixture.remove(incomplete);
    assert.throws(
      () => parseMedicalKnowledgeLocale(incomplete, "en"),
      fixture.expectedPath,
      `${fixture.name} was not required`,
    );
  }
});

test("locale loader rejects path-like locale identifiers", () => {
  assert.throws(
    () => loadMedicalKnowledgeLocale("../en"),
    /Invalid medical knowledge locale identifier/,
  );
});

test("locale validation rejects whitespace-only medical copy", () => {
  const blankDisclaimer = structuredClone(english);
  blankDisclaimer.disclaimers.educationalOnlyPleaseConsult = " \n\t";
  assert.throws(
    () => parseMedicalKnowledgeLocale(blankDisclaimer, "en"),
    /disclaimers\.educationalOnlyPleaseConsult: Text must contain a non-whitespace character/,
  );
});

test("locale assets are included in npm packages and production images", () => {
  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.ok(packageJson.files.includes("locales"), "npm package omits locale assets");

  const dockerfile = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
  assert.match(dockerfile, /COPY locales\/ \.\/locales\//);
  assert.match(dockerfile, /COPY --from=builder \/app\/locales \.\/locales/);
});
