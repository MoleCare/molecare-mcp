import assert from "node:assert/strict";
import { test } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// The 14 tools this server exposes. The ops tooling moved to molecare-ops-mcp
// (dist/ops.js); its tools are covered by that binary, not this list.
const EXPECTED_TOOL_NAMES = [
  "get_user_moles",
  "get_mole_analysis",
  "get_mole_changes",
  "get_user_risk_factors",
  "search_medical_info",
  "compare_moles",
  "lookup_medical_concept",
  "search_medical_concepts",
  "get_condition_progression",
  "map_snomed_to_icd10",
  "get_condition_risk_factors",
  "assess_risk_from_factors",
  "classify_lesion_features",
  "get_malignant_conditions",
];

const EXPECTED_RESOURCE_URIS = [
  "molecare://knowledge/abcde-criteria",
  "molecare://knowledge/skin-types",
  "molecare://knowledge/prevention-tips",
  "molecare://knowledge/when-to-see-doctor",
  "molecare://ontology/snomed-codes",
  "molecare://ontology/icd10-codes",
  "molecare://ontology/risk-factors",
];

const TOOL_ARGUMENTS = {
  assess_risk_from_factors: { riskFactorIds: ["FAIR_SKIN", "FAMILY_HISTORY"] },
  check_server_health: { instanceId: "i-0abc123def456789a" },
  compare_model_runs: { runIds: ["run-001-abc123", "run-002-def456"] },
  compare_moles: {
    moleId: "mole-001",
    imageId1: "image-001",
    imageId2: "image-002",
  },
  get_app_metrics: { app: "web" },
  get_condition_progression: { snomedCode: "254701007" },
  get_condition_risk_factors: { snomedCode: "372244006" },
  get_ec2_instance: { instanceId: "i-0abc123def456789a" },
  get_ec2_metrics: { instanceId: "i-0abc123def456789a" },
  get_feature_view_details: { name: "user_features" },
  get_mlflow_runs: { experimentId: "1" },
  get_model_version: {
    modelName: "melanoma-classifier-xception",
    version: "3",
  },
  get_mole_analysis: { moleId: "mole-001" },
  get_mole_changes: { moleId: "mole-001" },
  get_online_features: {
    featureView: "user_features",
    entityKey: { user_id: "user-001" },
  },
  get_table_stats: { schema: "public" },
  get_user_moles: { userId: "user-001" },
  get_user_risk_factors: { userId: "user-001" },
  lookup_medical_concept: { snomedCode: "372244006" },
  map_snomed_to_icd10: { snomedCode: "372244006" },
  search_medical_concepts: { query: "melanoma" },
  search_medical_info: { query: "ABCDE" },
};

const scrubbedEnv = {
  MOLECARE_API_URL: "http://127.0.0.1:9/api",
  NODE_ENV: "development",
  PATH: process.env.PATH ?? "",
};

test("built server answers every tool and resource in mock mode", async () => {
  const stderr = [];
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/index.js"],
    cwd: process.cwd(),
    env: scrubbedEnv,
    stderr: "pipe",
  });
  transport.stderr?.on("data", (chunk) => stderr.push(String(chunk)));

  const client = new Client(
    { name: "molecare-mock-smoke", version: "0.0.0" },
    { capabilities: {} }
  );

  try {
    await client.connect(transport);

    const { tools } = await client.listTools(undefined, { timeout: 5_000 });
    assert.deepEqual(
      tools.map((tool) => tool.name),
      EXPECTED_TOOL_NAMES
    );

    for (const [index, tool] of tools.entries()) {
      const result = await client.callTool(
        {
          name: tool.name,
          arguments: {
            userId: `smoke-user-${index}`,
            ...minimalArguments(tool),
            ...TOOL_ARGUMENTS[tool.name],
          },
        },
        undefined,
        { timeout: 10_000 }
      );

      assert.notEqual(result.isError, true, `${tool.name} returned a tool error`);
      assert.ok(Array.isArray(result.content), `${tool.name} returned no content array`);
      assert.ok(result.content.length > 0, `${tool.name} returned empty content`);
      assert.match(
        result.content.map((item) => item.text ?? "").join("\n"),
        /[A-Za-z0-9]/,
        `${tool.name} returned no readable text`
      );
    }

    const { resources } = await client.listResources(undefined, { timeout: 5_000 });
    assert.deepEqual(
      resources.map((resource) => resource.uri),
      EXPECTED_RESOURCE_URIS
    );

    for (const resource of resources) {
      const result = await client.readResource(
        { uri: resource.uri },
        { timeout: 5_000 }
      );
      assert.ok(Array.isArray(result.contents), `${resource.uri} returned no contents`);
      assert.ok(result.contents.length > 0, `${resource.uri} returned empty contents`);
      assert.match(
        result.contents.map((item) => item.text ?? "").join("\n"),
        /[A-Za-z0-9]/,
        `${resource.uri} returned no readable text`
      );
    }
  } catch (error) {
    if (error instanceof Error) {
      error.message += `\nServer stderr:\n${stderr.join("")}`;
      throw error;
    }
    throw new Error(`${String(error)}\nServer stderr:\n${stderr.join("")}`);
  } finally {
    await client.close();
  }
});

function minimalArguments(tool) {
  const args = {};

  for (const name of tool.inputSchema.required ?? []) {
    args[name] = exampleFor(tool.inputSchema.properties?.[name], name);
  }

  return args;
}

function exampleFor(schema = {}, propertyName = "value") {
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0];
  }

  switch (schema.type) {
    case "number":
    case "integer":
      return 1;
    case "boolean":
      return false;
    case "array":
      return [
        exampleFor(schema.items ?? { type: "string" }, propertyName),
        exampleFor(schema.items ?? { type: "string" }, propertyName),
      ];
    case "object":
      return { id: `${propertyName}-001` };
    default:
      return `${propertyName}-001`;
  }
}
