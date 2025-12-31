import fs from "fs";
import path from "path";
import { CoreRunner } from "../core/CoreRunner";
import { JsonSuite, ExecutionMode } from "../core/types";
import { RunResult, TestResult } from "../core/resultTypes";
import { validateResults } from "../core/validateResults";
import { validateSuite } from "../core/validateSuite";

export interface RunnerOptions {
  executionMode?: ExecutionMode;
  headless?: boolean;
  slowMo?: number;
  baseUrl?: string;
  stepRetries?: number;
  retryStepIds?: string[];
  retryDelayMs?: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function sanitizeId(input: string): string {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function formatTimestamp(iso: string): string {
  // 2025-12-15T04:07:33.123Z -> 20251215-040733
  const noMs = iso.replace(/\..+/, "").replace(/Z$/, "");
  const [date, time] = noMs.split("T");
  if (!date || !time) return String(Date.now());
  return `${date.replace(/-/g, "")}-${time.replace(/:/g, "")}`;
}

function durationMs(startIso: string, endIso: string): number {
  const s = Date.parse(startIso);
  const e = Date.parse(endIso);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 0;
  return Math.max(0, e - s);
}

export async function runSuiteFromFile(
  suitePath: string,
  options: RunnerOptions = {}
): Promise<{ runResult: RunResult; outPath: string }> {
  const raw = fs.readFileSync(suitePath, "utf-8");
  const suite = JSON.parse(raw) as JsonSuite;

  // Validate suite early for deterministic failure
  validateSuite(suite);

  const executionMode = options.executionMode ?? "stub";

  const runner = new CoreRunner({
    executionMode,
    headless: options.headless,
    slowMoMs: options.slowMo,
    baseUrl: options.baseUrl ?? suite.baseUrl,
    stepRetries: options.stepRetries,
    retryStepIds: options.retryStepIds,
    retryDelayMs: options.retryDelayMs,
  });

  const startedAt = nowIso();
  const tests: TestResult[] = [];

  try {
    for (const test of suite.tests ?? []) {
      const tr = await runner.run(test);
      tests.push(tr);
    }
  } finally {
    await runner.dispose();
  }

  const endedAt = nowIso();

  const summary = {
    total: tests.length,
    passed: tests.filter(t => t.status === "passed").length,
    failed: tests.filter(t => t.status === "failed").length,
    skipped: tests.filter(t => t.status === "skipped").length,
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
    durationMs: durationMs(startedAt, endedAt),
    tests,
    summary,
  };

  validateResults(runResult);

  const safeSuiteId = sanitizeId(suite.suiteId) || "unknown";
  const ts = formatTimestamp(startedAt);
  const outDir = path.join("artifacts", safeSuiteId);
  const outPath = path.join(outDir, `results_${ts}.json`);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(runResult, null, 2), "utf-8");

  return { runResult, outPath };
}
