import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type CliAction = "serve" | "version" | "help";

const PACKAGE_JSON_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "package.json"
);

export function getPackageVersion(): string {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")) as {
    version: string;
  };
  return pkg.version;
}

export function resolveCliAction(argv: string[]): CliAction {
  if (argv.length <= 2) {
    return "serve";
  }

  switch (argv[2]) {
    case "--version":
    case "-v":
      return "version";
    case "--help":
    case "-h":
      return "help";
    default:
      return "serve";
  }
}

export function printVersion(): void {
  console.log(getPackageVersion());
}

export function printHelp(): void {
  const version = getPackageVersion();
  console.log(`molecare-mcp ${version}

MCP server for educational dermatology knowledge and MoleCare/MLOps tooling.
Runs in mock mode with no credentials configured.

Usage:
  molecare-mcp                 Start the MCP server (stdio transport)
  molecare-mcp --version, -v   Print the package version
  molecare-mcp --help, -h      Show this help text

Environment variables (all optional):
  NODE_ENV, LOG_LEVEL, PORT, MCP_HEALTH_PORT
  MOLECARE_API_URL, MOLECARE_API_KEY, BACKEND_URL
  WEB_APP_URL, MOBILE_API_URL, ADMIN_API_URL
  MLFLOW_TRACKING_URI, MLFLOW_API_KEY, ML_SERVING_URL
  FEAST_SERVER_URL, FEAST_PROJECT, METRICS_API_URL
  DB_HOST, DB_PORT, DB_NAME, REDIS_HOST, ES_HOST
  AWS_REGION, AWS_PROFILE, AWS_ACCESS_KEY_ID, EC2_INSTANCE_IDS
  GITHUB_OWNER, GITHUB_REPO, GITHUB_TOKEN

With no variables set, the server returns synthetic mock data.
See .env.example and the README for details:
  https://github.com/MoleCare/molecare-mcp#readme
`);
}
