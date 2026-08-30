import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import {
  getPackageVersion,
  printHelp,
  printVersion,
  resolveCliAction,
} from "../dist/cli.js";

test("resolveCliAction maps version and help flags", () => {
  assert.equal(resolveCliAction(["node", "molecare-mcp"]), "serve");
  assert.equal(resolveCliAction(["node", "molecare-mcp", "--version"]), "version");
  assert.equal(resolveCliAction(["node", "molecare-mcp", "-v"]), "version");
  assert.equal(resolveCliAction(["node", "molecare-mcp", "--help"]), "help");
  assert.equal(resolveCliAction(["node", "molecare-mcp", "-h"]), "help");
  assert.equal(resolveCliAction(["node", "molecare-mcp", "--unknown"]), "serve");
});

test("printVersion prints the package version", () => {
  const lines = [];
  const originalLog = console.log;
  console.log = (value) => {
    lines.push(String(value));
  };

  try {
    printVersion();
    assert.equal(lines.join("\n"), getPackageVersion());
  } finally {
    console.log = originalLog;
  }
});

test("printHelp includes usage and README pointer", () => {
  const lines = [];
  const originalLog = console.log;
  console.log = (value) => {
    lines.push(String(value));
  };

  try {
    printHelp();
    const text = lines.join("\n");
    assert.match(text, /molecare-mcp \d+\.\d+\.\d+/);
    assert.match(text, /Usage:/);
    assert.match(text, /MOLECARE_API_URL/);
    assert.match(text, /github\.com\/MoleCare\/molecare-mcp#readme/);
  } finally {
    console.log = originalLog;
  }
});

test("--version exits 0 and prints the package version", () => {
  const result = spawnSync(process.execPath, ["dist/index.js", "--version"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 10_000,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), getPackageVersion());
});

test("--help exits 0 without starting stdio transport", () => {
  const result = spawnSync(process.execPath, ["dist/index.js", "--help"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 10_000,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage:/);
  assert.doesNotMatch(result.stderr, /MoleCare MCP Server running/);
});
