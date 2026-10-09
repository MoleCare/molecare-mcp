import assert from "node:assert/strict";
import { test } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Clients put the initialize instructions into the model's context before any
// tool runs, so the no-diagnosis line has to be there, and stay short.
test("the server tells every client its boundary at initialize", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/index.js"],
    env: { PATH: process.env.PATH ?? "" },
    stderr: "ignore",
  });
  const client = new Client({ name: "instructions-test", version: "0" });
  await client.connect(transport);
  try {
    const instructions = client.getInstructions();
    assert.ok(instructions, "initialize carries instructions");
    assert.ok(instructions.length < 1000, `instructions are ${instructions.length} characters`);
    assert.match(instructions, /not a medical device/);
    assert.match(instructions, /Never tell the user what a mole or spot is/);
    assert.match(instructions, /"dataSource": "mock"/);

    const tools = new Set((await client.listTools()).tools.map((t) => t.name));
    for (const name of instructions.match(/\b[a-z]+(?:_[a-z0-9]+)+\b/g)) {
      assert.ok(tools.has(name), `instructions name ${name}, which is not a tool`);
    }
  } finally {
    await client.close();
  }
});
