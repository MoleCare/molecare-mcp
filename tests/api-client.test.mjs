import assert from "node:assert/strict";
import { test } from "node:test";

import { MoleCareApiClient } from "../dist/api/molecare-client.js";
import { dispatchMoleTool } from "../dist/tools/moles.js";

// Port 9 is the discard service; nothing answers, so a real-mode client fails fast.
const UNREACHABLE = "http://127.0.0.1:9/api";

test("no credentials means mock mode, and every record says so", async () => {
  const client = new MoleCareApiClient({ baseUrl: "", apiKey: "" });
  assert.equal(client.mockMode, true);
  assert.equal(client.dataSource, "mock");

  const moles = await client.getUserMoles("user-001");
  assert.ok(moles.length > 0);

  const result = await dispatchMoleTool(client, "get_user_moles", { userId: "user-001" });
  const body = JSON.parse(result.content[0].text);
  assert.equal(body.dataSource, "mock");
  assert.equal(body.totalMoles, moles.length);
});

test("a URL without a key is still mock mode", () => {
  const client = new MoleCareApiClient({ baseUrl: UNREACHABLE, apiKey: "" });
  assert.equal(client.mockMode, true);
});

test("with a real backend configured, a failure is an error, never synthetic data", async () => {
  const client = new MoleCareApiClient({ baseUrl: UNREACHABLE, apiKey: "test-key" });
  assert.equal(client.mockMode, false);
  assert.equal(client.dataSource, "molecare-api");

  await assert.rejects(client.getUserMoles("user-001"), /MoleCare API getUserMoles failed: the backend could not be reached/);
  await assert.rejects(client.getMoleAnalysis("mole-001"), /getMoleAnalysis failed/);
  await assert.rejects(client.getMoleHistory("mole-001"), /getMoleHistory failed/);
  await assert.rejects(client.getUserProfile("user-001"), /getUserProfile failed/);
  await assert.rejects(client.compareMoleImages("mole-001", "img-1", "img-2"), /compareMoleImages failed/);
});

test("identifiers that are not plain ids never reach a request path", async () => {
  const client = new MoleCareApiClient({ baseUrl: UNREACHABLE, apiKey: "test-key" });
  for (const bad of ["../admin", "user/1", "a b", "", "x".repeat(65), "%2e%2e", "user?x=1"]) {
    await assert.rejects(client.getUserMoles(bad), /userId must be 1-64 letters, digits, '_' or '-'/, JSON.stringify(bad));
  }
  await assert.rejects(client.compareMoleImages("mole-001", "img/1", "img-2"), /imageId1 must be/);
  // Plain ids pass validation and fail only at the network, as expected here.
  await assert.rejects(client.getUserMoles("user_01-A"), /could not be reached/);
});

test("mock mode can be forced off explicitly", () => {
  const client = new MoleCareApiClient({ baseUrl: "http://example.invalid/api", apiKey: "k", mockMode: false });
  assert.equal(client.mockMode, false);
  const forced = new MoleCareApiClient({ baseUrl: "http://example.invalid/api", apiKey: "k", mockMode: true });
  assert.equal(forced.dataSource, "mock");
});
