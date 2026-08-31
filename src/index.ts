#!/usr/bin/env node

import { printHelp, printVersion, resolveCliAction } from "./cli.js";

const cliAction = resolveCliAction(process.argv);
if (cliAction === "version") {
  printVersion();
  process.exit(0);
}
if (cliAction === "help") {
  printHelp();
  process.exit(0);
}

await import("./server.js");
