#!/usr/bin/env node
import { CoreRunner } from "../coreRunner";
import { JsonTestDefinition } from "../types";
import * as fs from "fs";

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: testergizer <path-to-json-test>");
    process.exit(1);
  }
  const raw = fs.readFileSync(file, "utf-8");
  const def = JSON.parse(raw) as JsonTestDefinition;
  const runner = new CoreRunner();
  await runner.run(def);
  await runner.dispose();
}

main().catch(err => {
  console.error("[testergizer] Error:", err);
  process.exit(1);
});
