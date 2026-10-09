import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// server.json is the MCP Registry listing. Publishing happens after the tag
// exists and npm has the version, so a mistake here is expensive to unwind.
// v1.1.0 shipped a
// 129-character description and the registry rejected it with a 422; the tag
// and the GitHub release were already public by then.
const server = JSON.parse(readFileSync(new URL("../server.json", import.meta.url)));
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));

// The limit the registry enforces. Not a style preference.
const DESCRIPTION_LIMIT = 100;

test("the registry description fits inside the registry's limit", () => {
  assert.ok(
    server.description.length <= DESCRIPTION_LIMIT,
    `server.json description is ${server.description.length} characters; the registry rejects anything over ${DESCRIPTION_LIMIT}`,
  );
});

test("the version is the same in every place that declares one", () => {
  assert.equal(server.version, pkg.version);
  for (const entry of server.packages) {
    assert.equal(
      entry.version,
      pkg.version,
      `server.json packages[].version is ${entry.version} but package.json is ${pkg.version}`,
    );
  }
  // Both servers tell clients their version at initialize; 1.1.0 to 1.2.0 found
  // them hand-written in the source, so keep them on the package version too.
  for (const file of ["src/server.ts", "src/ops.ts"]) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(source, new RegExp(`version: "${pkg.version.replaceAll(".", "\\.")}",`), `${file} reports another version`);
  }
});

test("the npm package name the registry verifies matches what we publish", () => {
  const npmEntry = server.packages.find((p) => p.registryType === "npm");
  assert.ok(npmEntry, "server.json declares no npm package");
  assert.equal(npmEntry.identifier, pkg.name);
  // The registry checks that the published tarball carries this field back.
  assert.equal(pkg.mcpName, server.name);
});
