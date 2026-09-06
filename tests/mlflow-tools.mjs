import assert from "node:assert/strict";
import { test } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { MLflowApiClient } from "../dist/api/mlflow-client.js";
import { MlflowTools } from "../dist/tools/mlflow.js";

const MLFLOW_TOOL_NAMES = [
  "get_mlflow_experiments",
  "get_mlflow_runs",
  "get_registered_models",
  "get_model_version",
  "compare_model_runs",
];

function ctx() {
  const started = Date.now();
  return { userId: "mlflow-test", timer: () => Date.now() - started };
}

function textPayload(result) {
  assert.ok(Array.isArray(result.content), "expected content array");
  assert.ok(result.content[0]?.text, "expected text content");
  return JSON.parse(result.content[0].text);
}

function catalog() {
  return new MlflowTools(new MLflowApiClient({ baseUrl: "http://127.0.0.1:9" }));
}

test("MlflowTools lists the five ops tools and costs from one catalog", () => {
  const tools = catalog();
  assert.deepEqual(
    tools.tools.map((tool) => tool.name),
    MLFLOW_TOOL_NAMES
  );
  assert.deepEqual(
    MLFLOW_TOOL_NAMES.map((name) => tools.costs[name]),
    [1, 2, 1, 1, 3]
  );
});

test("MlflowTools.dispatch returns mock catalog, runs, registry, and comparison", async () => {
  const tools = catalog();

  const unknown = await tools.dispatch("get_feature_views", {}, ctx());
  assert.equal(unknown, undefined);

  const experiments = textPayload(
    await tools.dispatch("get_mlflow_experiments", {}, ctx())
  );
  assert.equal(experiments.count, 4);
  assert.deepEqual(
    experiments.experiments.map((item) => item.name),
    [
      "melanoma-detection-xception",
      "melanoma-detection-efficientnet",
      "mole-segmentation",
      "derm-foundation-finetuning",
    ]
  );

  const runs = textPayload(
    await tools.dispatch("get_mlflow_runs", { experimentId: "1", limit: 10 }, ctx())
  );
  assert.equal(runs.experimentId, "1");
  assert.equal(runs.count, 3);
  assert.equal(runs.runs[0].runId, "run-001-abc123");
  assert.equal(runs.runs[0].metrics.auc, 0.923);
  assert.equal(runs.runs[2].endTime, null);

  const models = textPayload(
    await tools.dispatch("get_registered_models", {}, ctx())
  );
  assert.equal(models.count, 3);
  assert.equal(models.models[0].name, "melanoma-classifier-xception");
  assert.equal(models.models[0].latestVersions[0].stage, "Production");

  const version = textPayload(
    await tools.dispatch(
      "get_model_version",
      { modelName: "melanoma-classifier-xception", version: "3" },
      ctx()
    )
  );
  assert.equal(version.model.currentStage, "Production");
  assert.equal(version.model.runId, "run-001-abc123");

  const missing = await tools.dispatch(
    "get_model_version",
    { modelName: "missing-model", version: "1" },
    ctx()
  );
  assert.equal(missing.isError, true);
  assert.match(missing.content[0].text, /not found/);

  const comparison = textPayload(
    await tools.dispatch(
      "compare_model_runs",
      { runIds: ["run-001-abc123", "run-002-def456"] },
      ctx()
    )
  );
  assert.equal(comparison.comparison["run-001-abc123"].auc, 0.923);
  assert.equal(comparison.comparison["run-002-def456"].auc, 0.912);
  assert.equal(comparison.runs.length, 2);
});

test("ops server still lists and answers the five MLflow tools", async () => {
  const stderr = [];
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/ops.js"],
    cwd: process.cwd(),
    env: {
      MOLECARE_API_URL: "http://127.0.0.1:9/api",
      NODE_ENV: "development",
      PATH: process.env.PATH ?? "",
    },
    stderr: "pipe",
  });
  transport.stderr?.on("data", (chunk) => stderr.push(String(chunk)));

  const client = new Client(
    { name: "mlflow-ops-tools", version: "0.0.0" },
    { capabilities: {} }
  );

  try {
    await client.connect(transport);

    const { tools } = await client.listTools(undefined, { timeout: 5_000 });
    const names = tools.map((tool) => tool.name);
    for (const name of MLFLOW_TOOL_NAMES) {
      assert.ok(names.includes(name), `ops binary is missing ${name}`);
    }

    const calls = [
      ["get_mlflow_experiments", {}],
      ["get_mlflow_runs", { experimentId: "1" }],
      ["get_registered_models", {}],
      [
        "get_model_version",
        { modelName: "melanoma-classifier-xception", version: "3" },
      ],
      ["compare_model_runs", { runIds: ["run-001-abc123", "run-002-def456"] }],
    ];

    for (const [index, [name, extra]] of calls.entries()) {
      const result = await client.callTool(
        {
          name,
          arguments: { userId: `mlflow-ops-${index}`, ...extra },
        },
        undefined,
        { timeout: 10_000 }
      );
      assert.notEqual(result.isError, true, `${name} failed: ${JSON.stringify(result.content)}`);
      const payload = textPayload(result);
      assert.ok(
        payload.experiments ||
          payload.runs ||
          payload.models ||
          payload.model ||
          payload.comparison
      );
    }
  } catch (error) {
    if (error instanceof Error) {
      error.message += `\nServer stderr:\n${stderr.join("")}`;
      throw error;
    }
    throw error;
  } finally {
    await client.close();
  }
});
