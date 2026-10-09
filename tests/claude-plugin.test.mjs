import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// The Claude Code plugin is three small files and a skill. Nothing builds them,
// so these tests are what keeps them in step with the package and the server.
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const pkg = JSON.parse(read("package.json"));
const plugin = JSON.parse(read(".claude-plugin/plugin.json"));
const marketplace = JSON.parse(read(".claude-plugin/marketplace.json"));
const mcp = JSON.parse(read(".mcp.json"));
const skill = read("skills/molecare/SKILL.md");

test("the plugin carries the package version", () => {
  assert.equal(plugin.version, pkg.version);
  const entry = marketplace.plugins.find((p) => p.name === plugin.name);
  assert.ok(entry, "marketplace.json lists the plugin");
  assert.equal(entry.source, "./");
  assert.equal(entry.version, pkg.version);
  assert.equal(plugin.license, pkg.license);
});

test("the plugin starts the published public server, never the ops server", () => {
  const servers = Object.values(mcp.mcpServers);
  assert.equal(servers.length, 1);
  assert.equal(servers[0].command, "npx");
  assert.deepEqual(servers[0].args, ["-y", pkg.name]);
  assert.equal(pkg.bin[pkg.name], "dist/index.js");
  assert.equal(servers[0].env, undefined, "no keys or URLs in the plugin");
});

test("the skill says what it is for and holds the no-diagnosis line", () => {
  const front = skill.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(front, "SKILL.md has frontmatter");
  assert.match(front[1], /^name: molecare$/m);
  assert.match(front[1], /^description: .*Use when .*never diagnoses\.$/m);
  assert.match(skill, /Never tell the user what a mole or a spot \*is\*/);
  assert.match(skill, /never present that as\s+the user's own moles/);
});

test("every tool and prompt the skill names exists on the server", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/index.js"],
    env: { PATH: process.env.PATH ?? "" },
    stderr: "ignore",
  });
  const client = new Client({ name: "plugin-test", version: "0" });
  await client.connect(transport);
  try {
    const tools = new Set((await client.listTools()).tools.map((t) => t.name));
    const prompts = new Set((await client.listPrompts()).prompts.map((p) => p.name));
    const named = [...skill.matchAll(/`([a-z0-9_]+)`/g)].map((m) => m[1]);
    const checked = named.filter((n) => n.includes("_") && !n.startsWith("molecare_"));
    assert.ok(checked.length >= 8, `skill names tools: ${checked}`);
    for (const name of checked) {
      assert.ok(tools.has(name) || prompts.has(name), `${name} is not a tool or prompt on the server`);
    }
  } finally {
    await client.close();
  }
});
