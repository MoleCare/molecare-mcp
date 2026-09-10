/**
 * Every resource this server publishes must stay on the educational side of
 * the clinical boundary, the same side every tool is held to.
 *
 * The tools were: `get_condition_risk_factors` strips `relativeRisk` before
 * answering, `assess_risk_from_factors` never multiplies anything, and
 * tests/clinical-boundary.test.mjs proves both. The resources were not.
 * `molecare://ontology/risk-factors` shipped the six multipliers the tools
 * refuse to emit (2.5, 3.0, 2.0, 5.0, 2.0, 9.0) and its listing advertised
 * "their relative risks". A client that read the resource instead of calling
 * the tool got exactly the numbers the boundary exists to withhold, and the
 * resources handler never imported the boundary at all.
 *
 * This starts the built server in mock mode, reads every resource it lists,
 * and fails on any verdict field in any of them. Keys are matched quoted, as
 * they appear in the JSON text, so a sentence such as "Highest risk of sun
 * damage" in the Fitzpatrick resource is not confused with a `riskLevel` band.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * Fields that turn education into a verdict. The first group is anything the
 * ontology backend computes per person; the second is a risk band on its own.
 */
const VERDICT_FIELDS =
  /"(relativeRisk|combinedRelativeRisk|overallRiskLevel|riskScore|matchScore|possibleConditions|elevatedRiskConditions|urgency|probability|confidence)"\s*:|"riskLevel"\s*:\s*"(HIGH|MODERATE|LOW|CRITICAL)"/;

/** The resources this server lists. Kept in step with tests/mock-mode-smoke.mjs. */
const EXPECTED_RESOURCE_COUNT = 8;

const scrubbedEnv = {
  MOLECARE_API_URL: "http://127.0.0.1:9/api",
  NODE_ENV: "development",
  PATH: process.env.PATH ?? "",
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
  const client = new Client({ name: "resources-boundary", version: "0.0.0" }, { capabilities: {} });
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

test("no listed resource carries a verdict field", async () => {
  await withServer(async (client) => {
    const { resources } = await client.listResources(undefined, { timeout: 5_000 });
    assert.equal(resources.length, EXPECTED_RESOURCE_COUNT, "resource list changed; update the smoke test too");

    for (const resource of resources) {
      assert.doesNotMatch(
        resource.description ?? "",
        /relative risk/i,
        `${resource.uri} advertises relative risks in its listing`,
      );

      const { contents } = await client.readResource({ uri: resource.uri }, { timeout: 5_000 });
      const text = contents.map((c) => c.text ?? "").join("\n");
      assert.ok(text.length > 0, `${resource.uri} returned nothing`);

      const hit = text.match(VERDICT_FIELDS);
      assert.equal(hit, null, `${resource.uri} carries a verdict field: ${hit?.[0]}`);
    }
  });
});

test("the risk-factors resource names factors and says what it is not", async () => {
  await withServer(async (client) => {
    const { contents } = await client.readResource(
      { uri: "molecare://ontology/risk-factors" },
      { timeout: 5_000 },
    );
    const payload = JSON.parse(contents[0].text);

    assert.match(payload.note ?? "", /not a risk score/i, "the resource does not carry the boundary note");
    assert.ok(Array.isArray(payload.riskFactors) && payload.riskFactors.length >= 6);
    for (const factor of payload.riskFactors) {
      assert.deepEqual(
        Object.keys(factor).sort(),
        ["category", "description", "id", "name"],
        `${factor.id} carries more than a name and a description: ${Object.keys(factor).join(", ")}`,
      );
    }
  });
});

test("the built server has no multiplier left to publish", () => {
  // Faster than the round trip above, and it catches a multiplier that is
  // defined but not yet wired to a resource.
  const built = readFileSync(new URL("../dist/server.js", import.meta.url), "utf8");
  assert.doesNotMatch(built, /relativeRisk\s*:/, "a relativeRisk literal is back in the server");
});
