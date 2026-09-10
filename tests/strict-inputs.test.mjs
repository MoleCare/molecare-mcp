/**
 * Every public tool validates its arguments against the schema it advertises,
 * and that schema is strict.
 *
 * Before this, validation was opt-in through a hand-kept map keyed by tool
 * name: six of fourteen tools were in it, eight ran unchecked. And zod's
 * default object strips unknown keys without a word, so
 * `classify_lesion_features({ asymetry: true })` — one letter off — arrived as
 * an empty feature set and was answered "no features noted" with isError
 * false. A SNOMED code went into a backend URL path as whatever string the
 * caller sent.
 *
 * Now the validator is derived from each tool's own inputSchema at
 * registration (see runtime.ts), so what the client is told and what the
 * server enforces cannot drift. This test drives the built server in mock
 * mode and checks the behaviour from the outside, the way a client sees it.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { validatorsFor } from "../dist/runtime.js";

const scrubbedEnv = {
  MOLECARE_API_URL: "http://127.0.0.1:9/api",
  NODE_ENV: "development",
  PATH: process.env.PATH ?? "",
};

/** Known-good arguments for every public tool, matching each declared schema. */
const VALID_ARGUMENTS = {
  get_user_moles: { userId: "user-001" },
  get_mole_analysis: { moleId: "mole-001" },
  get_mole_changes: { moleId: "mole-001" },
  get_user_risk_factors: { userId: "user-001" },
  search_medical_info: { query: "ABCDE" },
  compare_moles: { moleId: "mole-001", imageId1: "image-001", imageId2: "image-002" },
  lookup_medical_concept: { snomedCode: "93655004" },
  search_medical_concepts: { query: "melanoma" },
  get_condition_progression: { snomedCode: "93655004" },
  map_snomed_to_icd10: { snomedCode: "93655004" },
  get_condition_risk_factors: { snomedCode: "93655004" },
  assess_risk_from_factors: { riskFactorIds: ["FAIR_SKIN", "FAMILY_HISTORY"] },
  classify_lesion_features: { asymmetry: true, diameterMm: 7 },
  get_malignant_conditions: {},
};

async function withServer(fn) {
  const stderr = [];
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/index.js"],
    cwd: process.cwd(),
    env: scrubbedEnv,
    stderr: "pipe",
  });
  transport.stderr?.on("data", (chunk) => stderr.push(String(chunk)));
  const client = new Client({ name: "strict-inputs", version: "0.0.0" }, { capabilities: {} });
  try {
    await client.connect(transport);
    return await fn(client);
  } catch (error) {
    const detail = `\nServer stderr:\n${stderr.join("")}`;
    if (error instanceof Error) {
      error.message += detail;
      throw error;
    }
    throw new Error(`${String(error)}${detail}`);
  } finally {
    await client.close();
  }
}

/** Call a tool and return { isError, body } with the JSON body parsed when it is JSON. */
async function call(client, name, args) {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 10_000 });
  const text = result.content?.map((c) => c.text ?? "").join("\n") ?? "";
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  return { isError: result.isError === true, body, text };
}

function expectValidationError({ isError, body, text }, name, pattern) {
  assert.equal(isError, true, `${name} did not return a tool error: ${text.slice(0, 200)}`);
  assert.equal(body.code, "VALIDATION_ERROR", `${name} failed for another reason: ${text.slice(0, 200)}`);
  if (pattern) assert.match(body.message, pattern, `${name}: ${body.message}`);
}

test("every public tool advertises a strict schema and rejects an unknown key", async () => {
  await withServer(async (client) => {
    const { tools } = await client.listTools(undefined, { timeout: 5_000 });
    assert.equal(tools.length, Object.keys(VALID_ARGUMENTS).length, "tool list changed; update VALID_ARGUMENTS");

    for (const tool of tools) {
      assert.equal(
        tool.inputSchema.additionalProperties,
        false,
        `${tool.name} does not advertise additionalProperties: false`,
      );
      const valid = VALID_ARGUMENTS[tool.name];
      assert.ok(valid, `no known-good arguments for ${tool.name}`);

      // The same call, with one key the schema never mentioned.
      const withJunk = await call(client, tool.name, { ...valid, bogus: 1 });
      expectValidationError(withJunk, tool.name, /bogus/);

      // And the good call still works, so strictness is not a blanket refusal.
      const good = await call(client, tool.name, valid);
      assert.equal(good.isError, false, `${tool.name} rejected its own known-good arguments: ${good.text.slice(0, 200)}`);
    }
  });
});

test("a misspelt feature is an error, not an empty feature set", async () => {
  await withServer(async (client) => {
    // One letter off. Used to be answered "no features noted" with isError false.
    expectValidationError(
      await call(client, "classify_lesion_features", { asymetry: true }),
      "classify_lesion_features",
      /asymetry/,
    );
    // Nothing at all is not a lesion description either.
    expectValidationError(
      await call(client, "classify_lesion_features", {}),
      "classify_lesion_features",
      /at least one feature/,
    );
    // Out of range is out of range.
    expectValidationError(
      await call(client, "classify_lesion_features", { diameterMm: 900 }),
      "classify_lesion_features",
      /diameterMm/,
    );
  });
});

test("a SNOMED code is digits, never a path", async () => {
  await withServer(async (client) => {
    // Four backend routes interpolate this straight into a URL path.
    for (const name of ["lookup_medical_concept", "get_condition_progression", "map_snomed_to_icd10", "get_condition_risk_factors"]) {
      expectValidationError(await call(client, name, { snomedCode: "../risk-assessment" }), name, /snomedCode/);
      expectValidationError(await call(client, name, { snomedCode: "" }), name, /snomedCode/);
      expectValidationError(await call(client, name, { snomedCode: 93655004 }), name, /snomedCode/);
    }
  });
});

test("free text and factor lists are bounded", async () => {
  await withServer(async (client) => {
    expectValidationError(await call(client, "search_medical_concepts", { query: "" }), "search_medical_concepts", /query/);
    expectValidationError(await call(client, "search_medical_concepts", { query: "x".repeat(201) }), "search_medical_concepts", /query/);
    expectValidationError(await call(client, "search_medical_info", { query: "x".repeat(201) }), "search_medical_info", /query/);
    // A single string is not a list; it used to be treated as one and matched by substring.
    expectValidationError(await call(client, "assess_risk_from_factors", { riskFactorIds: "FAIR_SKIN" }), "assess_risk_from_factors", /riskFactorIds/);
    expectValidationError(await call(client, "assess_risk_from_factors", { riskFactorIds: [] }), "assess_risk_from_factors", /riskFactorIds/);
    expectValidationError(await call(client, "assess_risk_from_factors", { riskFactorIds: ["../x"] }), "assess_risk_from_factors", /riskFactorIds/);
  });
});

test("a tool that declares no arguments accepts none, userId included", async () => {
  await withServer(async (client) => {
    expectValidationError(
      await call(client, "get_malignant_conditions", { userId: "user-001" }),
      "get_malignant_conditions",
      /userId/,
    );
  });
});

test("validators are derived from the advertised schema, so a new tool cannot opt out", () => {
  const validators = validatorsFor([
    { name: "brand_new_tool", inputSchema: { type: "object", additionalProperties: false, properties: { id: { type: "string" } }, required: ["id"] } },
  ]);
  const v = validators.get("brand_new_tool");
  assert.ok(v, "no validator derived");
  assert.equal(v.safeParse({ id: "a" }).success, true);
  assert.equal(v.safeParse({ id: "a", extra: 1 }).success, false);
  assert.equal(v.safeParse({}).success, false);
});
