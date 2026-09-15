import assert from "node:assert/strict";
import { test } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scrubbedEnv = {
  MOLECARE_API_URL: "http://127.0.0.1:9/api",
  NODE_ENV: "development",
  PATH: process.env.PATH ?? "",
};

async function withServer(fn) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/index.js"],
    cwd: process.cwd(),
    env: scrubbedEnv,
    stderr: "pipe",
  });
  const client = new Client({ name: "prompts-test", version: "0.0.0" }, { capabilities: {} });
  try {
    await client.connect(transport);
    return await fn(client);
  } finally {
    await client.close();
  }
}

test("lists safe educational prompts and renders each disclaimer", async () => {
  await withServer(async (client) => {
    const { prompts } = await client.listPrompts();
    assert.deepEqual(prompts.map((prompt) => prompt.name), [
      "walk_through_abcde",
      "prepare_dermatology_appointment",
      "explain_snomed_code",
    ]);
    for (const prompt of prompts) {
      const args = prompt.name === "explain_snomed_code" ? { code: "123" } : {};
      const result = await client.getPrompt({ name: prompt.name, arguments: args });
      const text = result.messages[0].content.text;
      assert.match(text, /educational only/i);
      assert.doesNotMatch(text, /likely melanoma|within \d+ days|seek urgent care/i);
    }
  });
});

test("requires a code for terminology prompt", async () => {
  await withServer(async (client) => {
    await assert.rejects(
      () => client.getPrompt({ name: "explain_snomed_code" }),
      /Prompt not found or missing required arguments/,
    );
  });
});
