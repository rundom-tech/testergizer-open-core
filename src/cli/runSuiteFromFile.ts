import fs from "fs";
import { CoreRunner } from "../core/CoreRunner";
import { JsonTestDefinition } from "../core/types";
import { RunResult } from "../core/resultTypes";
import { validateResults } from "../core/validateResults";

function nowIso(): string {
  return new Date().toISOString();
}

export async function runSuiteFromFile(
  suitePath: string,
  options: any = {}
): Promise<RunResult> {
  const raw = fs.readFileSync(suitePath, "utf-8");
  const suite = JSON.parse(raw);

  const runner = new CoreRunner({
    executionMode: options.executionMode ?? "stub",
    headless: options.headless,
    slowMoMs: options.slowMo
  });

  const startedAt = nowIso();
  const testResults = [];

  for (const test of suite.tests as JsonTestDefinition[]) {
    const result = await runner.run(test);
    testResults.push(result);
  }

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
    executionMode: options.executionMode ?? "stub",
    startedAt,
    endedAt,
    tests: testResults,
    summary
  };

  validateResults(runResult);
  return runResult;
}
