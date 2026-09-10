/**
 * The ops server must keep credentials out of stderr too.
 *
 * tests/no-secret-in-logs.test.mjs proves it for the public server
 * (dist/index.js). Review of #79 pointed out that twenty of the logging sites
 * that PR changed live in clients only the ops server (dist/ops.js) registers:
 * MLflow, GitHub Actions, Feast, the app and database probes. A regression in
 * any of them would have passed the public-server canary.
 *
 * This runs the ops server the way production would: NODE_ENV=production so
 * every client leaves mock mode, a canary in every credential it reads, and
 * every URL pointed at the discard port so each call fails fast and takes the
 * error-logging path. The GitHub client has its host hard-coded, so an HTTP
 * proxy on the discard port keeps that call local as well; nothing here leaves
 * the machine. The EC2 client is deliberately not exercised: the AWS SDK does
 * not honour that proxy, so a canary key there was a real request to AWS.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CANARY = "CANARY-OPS-SECRET-DO-NOT-LOG-4e7d";

/** Port 9 is the discard service: nothing answers, so every call fails fast. */
const UNREACHABLE = "http://127.0.0.1:9";

/** One tool per client, so every client's failure path is exercised. */
const CALLS = [
  ["get_mlflow_runs", { experimentId: "1" }],
  ["get_registered_models", {}],
  ["get_pipeline_runs", {}],
  ["get_releases", {}],
  ["get_feature_views", {}],
  ["get_app_status", {}],
  ["get_app_metrics", { app: "web" }],
  ["get_database_metrics", {}],
  ["get_system_health", {}],
];

/**
 * The line each client writes when its call fails. If one is missing the run
 * did not reach that client's error path and this test would pass vacuously,
 * so each is asserted present.
 */
const FAILURE_MARKERS = {
  mlflow: /MLflow API error/,
  github: /GitHub API error/,
  feast: /Feast API error/,
  app: /Failed to get (app metrics|web app status)/,
  database: /Failed to get (database metrics|Postgres status)/,
};

const REQUESTS = [
  {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "ops-secret-probe", version: "1.0" },
    },
  },
  { jsonrpc: "2.0", method: "notifications/initialized" },
  ...CALLS.map(([name, args], i) => ({
    jsonrpc: "2.0",
    id: 10 + i,
    method: "tools/call",
    params: { name, arguments: args },
  })),
];

function runOpsServer() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(ROOT, "dist", "ops.js")], {
      env: {
        PATH: process.env.PATH ?? "",
        NODE_ENV: "production",
        // Credentials: every one a canary.
        MOLECARE_API_KEY: CANARY,
        MLFLOW_API_KEY: CANARY,
        GITHUB_TOKEN: CANARY,
        // Endpoints: every one unreachable, locally.
        MOLECARE_API_URL: `${UNREACHABLE}/api`,
        MLFLOW_TRACKING_URI: UNREACHABLE,
        FEAST_SERVER_URL: UNREACHABLE,
        WEB_APP_URL: UNREACHABLE,
        MOBILE_API_URL: `${UNREACHABLE}/api`,
        BACKEND_URL: UNREACHABLE,
        ADMIN_API_URL: UNREACHABLE,
        METRICS_API_URL: UNREACHABLE,
        ML_SERVING_URL: UNREACHABLE,
        DB_HOST: "127.0.0.1",
        DB_PORT: "9",
        REDIS_HOST: "127.0.0.1:9",
        ES_HOST: "127.0.0.1:9",
        // The GitHub client's host is hard-coded; a proxy on the discard port
        // keeps that request on this machine.
        HTTP_PROXY: UNREACHABLE,
        HTTPS_PROXY: UNREACHABLE,
        NO_PROXY: "",
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
    }, 8000);
  });
}

test("no credential reaches the ops server's stderr when every backend fails", async () => {
  const { stderr, stdout } = await runOpsServer();

  assert.ok(stderr.length > 0, "expected the ops server to log something");
  for (const [client, marker] of Object.entries(FAILURE_MARKERS)) {
    assert.match(stderr, marker, `the ${client} client's failure path did not run; this test would prove nothing`);
  }

  const offending = stderr.split("\n").filter((l) => l.includes(CANARY));
  assert.equal(
    offending.length,
    0,
    `a credential reached the ops server's stderr. Look for a raw error handed to a logger; ` +
      `use describeError(). Offending output:\n${offending.slice(0, 3).join("\n")}`,
  );
  assert.ok(!stdout.includes(CANARY), "a credential reached a tool result on stdout");
  assert.ok(!/authorization/i.test(stderr), "an Authorization header reached stderr");
  assert.ok(!/bearer/i.test(stderr), "a bearer token reached stderr");
});
