import fs from "fs";
import path from "path";
import { CoreRunner } from "../core/CoreRunner";
import { JsonTestDefinition } from "../core/types";
import { RunResult } from "../core/resultTypes";
import { validateResults } from "../core/validateResults";

function nowIso(): string {
  return new Date().toISOString();
}

function formatTimestamp(iso: string): string {
  // 2025-12-30T23:35:58.613Z → 20251230-233558
  return iso
    .replace(/\..+/, "")
    .replace("T", "-")
    .replace(/[:Z]/g, "");
}

export async function runSuiteFromFile(
  suitePath: string,
  options: any = {}
): Promise<RunResult> {
  const raw = fs.readFileSync(suitePath, "utf-8");
  const suite = JSON.parse(raw);

  if (!suite.suiteId || !Array.isArray(suite.tests)) {
    throw new Error("Invalid suite file: missing suiteId or tests[]");
  }

  const executionMode = options.executionMode ?? "stub";

  const runner = new CoreRunner({
    executionMode,
    headless: options.headless,
    slowMoMs: options.slowMo
  });

  const startedAt = nowIso();
  const testResults = [];

  for (const test of suite.tests as JsonTestDefinition[]) {
    const result = await runner.run(test);
    testResults.push(result);
  }

  await runner.dispose();

  const endedAt = nowIso();

  const summary = {
    total: testResults.length,
    passed: testResults.filter(t => t.status === "passed").length,
    failed: testResults.filter(t => t.status === "failed").length,
    skipped: testResults.filter(t => t.status === "skipped").length
  };

  const runResult: RunResult = {
    schemaVersion: "v1",
    runId: `${suite.suiteId}-${Date.now()}`,
    suiteId: suite.suiteId,
    suiteName: suite.suiteName,
    suitePath,
    executionMode,
    startedAt,
    endedAt,
    tests: testResults,
    summary
  };

  // 1. Validate against strict schema
  validateResults(runResult);

  // 2. Persist to disk (CLI responsibility)
  const ts = formatTimestamp(startedAt);
  const outDir = path.join("artifacts", suite.suiteId);
  const outFile = path.join(
    outDir,
    `run_${suite.suiteId}_${ts}.json`
  );

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(runResult, null, 2), "utf-8");

  console.log(`Run results written to ${outFile}`);

  return runResult;
}
