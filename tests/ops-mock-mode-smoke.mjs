import assert from "node:assert/strict";
import { test } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Dermatology / MoleCare API tools live on dist/index.js. If any of these
// appear on the ops binary, the split has leaked.
const PUBLIC_BRIDGE_TOOLS = [
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

const ANCHOR_RESOURCES = [
  "molecare://devops/architecture",
  "molecare://devops/runbooks",
  "molecare://mlops/model-catalog",
  "molecare://mlops/feature-catalog",
];

// Overrides only where the mock clients look up a specific id.
const TOOL_ARGUMENTS = {
  check_server_health: { instanceId: "i-0abc123def456789a" },
  compare_model_runs: { runIds: ["run-001-abc123", "run-002-def456"] },
  get_app_metrics: { app: "web" },
  get_ec2_instance: { instanceId: "i-0abc123def456789a" },
  get_ec2_metrics: { instanceId: "i-0abc123def456789a" },
  get_feature_view_details: { name: "user_features" },
  get_mlflow_runs: { experimentId: "1" },
  get_model_version: {
    modelName: "melanoma-classifier-xception",
    version: "3",
  },
  get_online_features: {
    featureView: "user_features",
    entityKey: { user_id: "user-001" },
  },
  get_table_stats: { schema: "public" },
};

const scrubbedEnv = {
  MOLECARE_API_URL: "http://127.0.0.1:9/api",
  NODE_ENV: "development",
  PATH: process.env.PATH ?? "",
};

test("ops binary answers every tool and resource in mock mode", async () => {
  const stderr = [];
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/ops.js"],
    cwd: process.cwd(),
    env: scrubbedEnv,
    stderr: "pipe",
  });
  transport.stderr?.on("data", (chunk) => stderr.push(String(chunk)));

  const client = new Client(
    { name: "molecare-ops-mock-smoke", version: "0.0.0" },
    { capabilities: {} }
  );

  try {
    await client.connect(transport);

    const { tools } = await client.listTools(undefined, { timeout: 5_000 });
    const toolNames = tools.map((tool) => tool.name);

    // Names come from the built server so this list cannot go stale the way
    // a handwritten 39-name array did in #42.
    assert.ok(tools.length >= 30, `expected at least 30 ops tools, got ${tools.length}`);
    for (const leaked of PUBLIC_BRIDGE_TOOLS) {
      assert.equal(
        toolNames.includes(leaked),
        false,
        `${leaked} belongs on molecare-mcp, not molecare-ops-mcp`
      );
    }

    for (const [index, tool] of tools.entries()) {
      const result = await client.callTool(
        {
          name: tool.name,
          arguments: {
            userId: `ops-smoke-${index}`,
            ...minimalArguments(tool),
            ...TOOL_ARGUMENTS[tool.name],
          },
        },
        undefined,
        { timeout: 10_000 }
      );

      assert.notEqual(
        result.isError,
        true,
        `${tool.name} returned a tool error: ${JSON.stringify(result.content)}`
      );
      assert.ok(Array.isArray(result.content), `${tool.name} returned no content array`);
      assert.ok(result.content.length > 0, `${tool.name} returned empty content`);
      assert.match(
        result.content.map((item) => item.text ?? "").join("\n"),
        /[A-Za-z0-9]/,
        `${tool.name} returned no readable text`
      );
    }

    const { resources } = await client.listResources(undefined, { timeout: 5_000 });
    const uris = resources.map((resource) => resource.uri);
    for (const uri of ANCHOR_RESOURCES) {
      assert.ok(uris.includes(uri), `missing resource ${uri}`);
    }

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
