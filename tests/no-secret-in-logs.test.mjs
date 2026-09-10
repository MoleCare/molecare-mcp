/**
 * A credential must never reach stderr.
 *
 * An MCP server's stderr is read by its client and is routinely surfaced in a
 * debug pane, so anything printed there is in someone else's log file. Axios
 * puts the whole request on `error.config`, headers included, so
 * `console.error("...", error)` prints `Authorization: Bearer <key>`.
 *
 * That is exactly what happened: with a canary key set and the backend
 * unreachable, the key appeared twice in stderr. This test runs the real
 * server the same way and greps for the canary, so the next raw error log is
 * caught here rather than in production.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

import { describeError, describeFatal } from "../dist/utils/safe-error.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CANARY = "CANARY-SECRET-DO-NOT-LOG-9f2b";

/** Port 9 is the discard service: nothing answers, so every call fails fast. */
const UNREACHABLE = "http://127.0.0.1:9/api";

const REQUESTS = [
  {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "secret-probe", version: "1.0" },
    },
  },
  { jsonrpc: "2.0", method: "notifications/initialized" },
  // One tool from each client, so every failing HTTP path is exercised.
  { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_user_moles", arguments: { userId: "user-001" } } },
  { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "lookup_medical_concept", arguments: { snomedCode: "372244006" } } },
  { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "map_snomed_to_icd10", arguments: { snomedCode: "372244006" } } },
  { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "get_condition_risk_factors", arguments: { snomedCode: "372244006" } } },
];

function runServer() {
  return new Promise((resolve) => {
    const child = spawn("node", [join(ROOT, "dist", "index.js")], {
      env: {
        ...process.env,
        MOLECARE_API_URL: UNREACHABLE,
        MOLECARE_API_KEY: CANARY,
        ONTOLOGY_API_URL: UNREACHABLE,
        ONTOLOGY_API_KEY: CANARY,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderr = "";
    let stdout = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.stdout.on("data", (chunk) => (stdout += chunk));

    for (const request of REQUESTS) child.stdin.write(`${JSON.stringify(request)}\n`);

    setTimeout(() => {
      child.kill();
      resolve({ stderr, stdout });
    }, 6000);
  });
}

test("no API key reaches stderr, even when every backend call fails", async () => {
  const { stderr, stdout } = await runServer();

  // Sanity: the run has to have actually failed some calls, or this proves
  // nothing. A silent run would pass vacuously.
  assert.ok(stderr.length > 0, "expected the server to log something");

  assert.ok(
    !stderr.includes(CANARY),
    `the API key reached stderr. Look for console.error(..., error) with a raw ` +
      `Axios error; use describeError(). Offending output:\n` +
      stderr.split("\n").filter((l) => l.includes(CANARY)).slice(0, 3).join("\n"),
  );
  assert.ok(!stdout.includes(CANARY), "the API key reached stdout");
  assert.ok(
    !/authorization/i.test(stderr),
    "an Authorization header reached stderr",
  );
});

test("describeError keeps what helps and drops what leaks", () => {
  const axiosError = {
    isAxiosError: true,
    code: "ECONNREFUSED",
    message: "connect ECONNREFUSED 127.0.0.1:9",
    config: {
      method: "get",
      url: "http://127.0.0.1:9/api/concepts/372244006?apiKey=" + CANARY,
      headers: { Authorization: `Bearer ${CANARY}` },
    },
    response: undefined,
  };

  const described = describeError(axiosError);
  assert.ok(!described.includes(CANARY), "the query string or header leaked");
  assert.match(described, /ECONNREFUSED/, "the reason was dropped");
  assert.match(described, /GET http:\/\/127\.0\.0\.1:9\/api\/concepts\/372244006/);
  assert.ok(!described.includes("?"), "the query string was kept");
});

test("describeError reports an HTTP status when there is one", () => {
  const described = describeError({
    isAxiosError: true,
    message: "Request failed with status code 503",
    config: { method: "post", url: "https://api.example.com/v1/thing" },
    response: { status: 503 },
  });
  assert.match(described, /HTTP 503/);
  assert.match(described, /POST https:\/\/api\.example\.com\/v1\/thing/);
});

test("a plain Error keeps its message, and a fatal one keeps its stack", () => {
  const err = new Error("something ordinary went wrong");
  assert.equal(describeError(err), "something ordinary went wrong");
  assert.match(describeFatal(err), /something ordinary went wrong/);
  assert.match(describeFatal(err), /at /, "the stack was dropped");
});

test("a thrown non-Error is never spread into the log", () => {
  // A thrown object could be a response body carrying patient data.
  assert.equal(describeError({ patientName: "Ada", token: CANARY }), "unknown error");
});
