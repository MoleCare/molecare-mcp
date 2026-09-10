/**
 * A credential must never reach stderr. Neither may a patient identifier.
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
 *
 * The same run carries patient-id canaries. Before the logger hashed
 * identifiers, every failed tool call wrote its userId, moleId and imageIds to
 * stderr in clear, and the rate-limit warning interpolated the userId into its
 * message. Those are quasi-identifiers for a person, a mole and a photo.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

import { describeError, describeFatal } from "../dist/utils/safe-error.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CANARY = "CANARY-SECRET-DO-NOT-LOG-9f2b";
const USER = "user-CANARYPID-7c1f";
const MOLE = "mole-CANARYMID-3e9a";
const IMAGE_1 = "img-CANARYIMG-11aa";
const IMAGE_2 = "img-CANARYIMG-22bb";
const PATIENT_CANARIES = ["CANARYPID", "CANARYMID", "CANARYIMG"];

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
  { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_user_moles", arguments: { userId: USER } } },
  { jsonrpc: "2.0", id: 20, method: "tools/call", params: { name: "get_mole_analysis", arguments: { moleId: MOLE } } },
  { jsonrpc: "2.0", id: 21, method: "tools/call", params: { name: "compare_moles", arguments: { moleId: MOLE, imageId1: IMAGE_1, imageId2: IMAGE_2 } } },
  // An unknown tool still logs its arguments.
  { jsonrpc: "2.0", id: 22, method: "tools/call", params: { name: "no_such_tool", arguments: { userId: USER } } },
  // The free tier starts a user at 60 tokens; get_user_moles costs 2. Thirty
  // calls drain it and the rest trip the limiter, so its warning line is in
  // the run too. A tool that declares userId, so this still holds once every
  // schema is strict.
  ...Array.from({ length: 34 }, (_, i) => (
    { jsonrpc: "2.0", id: 100 + i, method: "tools/call", params: { name: "get_user_moles", arguments: { userId: USER } } }
  )),
  { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "lookup_medical_concept", arguments: { snomedCode: "93655004" } } },
  { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "map_snomed_to_icd10", arguments: { snomedCode: "93655004" } } },
  { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "get_condition_risk_factors", arguments: { snomedCode: "93655004" } } },
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

test("no patient identifier reaches stderr, hashed stand-ins do", async () => {
  const { stderr } = await runServer();

  // The paths that used to leak must all have run, or this proves nothing.
  assert.match(stderr, /Tool call: get_user_moles/, "the failed-call log path did not run");
  assert.match(stderr, /Tool call: no_such_tool/, "the unknown-tool log path did not run");
  assert.match(stderr, /Rate limit exceeded/, "the rate-limit log path did not run");

  for (const canary of PATIENT_CANARIES) {
    const offending = stderr.split("\n").filter((l) => l.includes(canary));
    assert.equal(
      offending.length,
      0,
      `a patient identifier (${canary}) reached stderr:\n${offending.slice(0, 3).join("\n")}`,
    );
  }

  // Hashed, not silenced: the lines still carry a correlatable stand-in.
  assert.match(stderr, /"userId":"id#[0-9a-f]{10}"/, "userId was dropped rather than hashed");
  assert.match(stderr, /"moleId":"id#[0-9a-f]{10}"/, "moleId was dropped rather than hashed");
  // Every get_user_moles line in this run is the same user (calls without a
  // userId are logged as "anonymous", which hashes to something else).
  const hashes = stderr
    .split("\n")
    .filter((l) => l.includes("Tool call: get_user_moles"))
    .map((l) => l.match(/"userId":"(id#[0-9a-f]{10})"/)?.[1]);
  assert.ok(hashes.length >= 20 && hashes.every(Boolean), `expected a hashed userId on every get_user_moles line, got ${hashes.length}`);
  assert.equal(new Set(hashes).size, 1, "the same user hashed differently within one run");
});

test("describeError keeps what helps and drops what leaks", () => {
  const axiosError = {
    isAxiosError: true,
    code: "ECONNREFUSED",
    message: "connect ECONNREFUSED 127.0.0.1:9",
    config: {
      method: "get",
      url: "http://127.0.0.1:9/api/concepts/93655004?apiKey=" + CANARY,
      headers: { Authorization: `Bearer ${CANARY}` },
    },
    response: undefined,
  };

  const described = describeError(axiosError);
  assert.ok(!described.includes(CANARY), "the query string or header leaked");
  assert.match(described, /ECONNREFUSED/, "the reason was dropped");
  assert.match(described, /GET http:\/\/127\.0\.0\.1:9\/api\/concepts\/93655004/);
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
