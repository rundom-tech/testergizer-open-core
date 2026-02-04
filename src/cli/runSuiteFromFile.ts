import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { pathToFileURL } from "url";

import { CoreRunner } from "../core/CoreRunner";
import { JsonReporter } from "../tools/jsonReporter";
import { HtmlReporter } from "../tools/htmlReporter";
import { createArtifactObserver, ensureArtifactsIndex } from "../tools/artifactObserver";

import {
  resolveRootContext,
  parseInjectedSecrets,
  interpolateDeepStrict
} from "./resolveInputs";

import {
  validateExecutableDoc,
  validateIncludesAgainstRegistry,
  validateInterpolationCompleteness,
  throwIfIssues
} from "./validate";

import type { ExecutableDoc } from "./validate";
import type { JsonTestDefinition, ExecutionMode } from "../core/types";
import type { RunResult, TestResult } from "../core/resultTypes";

/**
 * Public, frozen API.
 * Used by platform tests and programmatic callers.
 * DO NOT change this signature.
 */
export interface RunSuiteOptions {
  executionMode?: ExecutionMode;
  artifactsDir?: string;

  // Forwarded to CoreRunner
  headless?: boolean;
  slowMoMs?: number;
  baseUrl?: string;

  /** Playwright project semantics (for now: browser family) */
  browserName?: "chromium" | "firefox" | "webkit";
}

/**
 * Minimal SuiteDoc (group of tests), still supports inline executables for demos.
 * Canonical long-term: tests referenced by file (string / ref / path).
 */
type SuiteTestRef = string | { ref: string } | { path: string };
type SuiteTestEntry = ExecutableDoc | SuiteTestRef;

interface SuiteDoc {
  schemaVersion: "v1";
  suiteId: string;
  suiteName?: string;
  baseUrl?: string;
  context?: Record<string, any>;
  tests: SuiteTestEntry[];
}

/* ============================================================
 * Type guards
 * ============================================================ */

function isObject(v: any): v is Record<string, any> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isExecutableLike(v: any): v is ExecutableDoc {
  return isObject(v) && typeof v.id === "string" && Array.isArray((v as any).steps);
}

function isSuiteDoc(v: any): v is SuiteDoc {
  return (
    isObject(v) &&
    v.schemaVersion === "v1" &&
    typeof v.suiteId === "string" &&
    Array.isArray(v.tests)
  );
}

/* ============================================================
 * Helpers
 * ============================================================ */

function loadJson(filePath: string): any {
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

function nowIso(): string {
  return new Date().toISOString();
}

function toDateFolder(iso: string): string {
  return iso.slice(0, 10); // YYYY-MM-DD
}

function durationMs(startIso: string, endIso: string): number {
  const s = Date.parse(startIso);
  const e = Date.parse(endIso);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 0;
  return Math.max(0, e - s);
}

function loadAllExecutables(dir: string): Map<string, ExecutableDoc> {
  const map = new Map<string, ExecutableDoc>();
  if (!fs.existsSync(dir)) return map;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const e of entries) {
    const full = path.join(dir, e.name);

    if (e.isDirectory()) {
      for (const [k, v] of loadAllExecutables(full)) map.set(k, v);
    } else if (e.isFile() && e.name.endsWith(".json")) {
      const doc = loadJson(full) as ExecutableDoc;
      if (map.has(doc.id)) throw new Error(`Duplicate executable id: ${doc.id}`);
      map.set(doc.id, doc);
    }
  }

  return map;
}

/**
 * Include expansion is linear and deterministic.
 */
function expandIncludes(root: ExecutableDoc, registry: Map<string, ExecutableDoc>): ExecutableDoc {
  const expandedSteps: any[] = [];

  for (const step of root.steps) {
    if (step?.type === "include") {
      const ref = step.ref;
      const target = registry.get(ref);

      if (!target) throw new Error(`Include reference not found: ${ref}`);
      if (!target.reusable) throw new Error(`Include target is not reusable: ${ref}`);
      if (target.steps.some((s) => s?.type === "include")) {
        throw new Error(`Reusable "${ref}" must not contain include steps`);
      }

      expandedSteps.push(...target.steps);
    } else {
      expandedSteps.push(step);
    }
  }

  return {
    id: root.id,
    reusable: false,
    context: root.context,
    steps: expandedSteps
  };
}

function normalizeSuiteTestEntry(params: {
  entry: SuiteTestEntry;
  suiteDir: string;
  suiteFilePath: string;
  index: number;
}): { doc: ExecutableDoc; filePath: string } {
  const { entry, suiteDir, suiteFilePath, index } = params;

  if (isExecutableLike(entry)) {
    return { doc: entry, filePath: `${suiteFilePath}#tests[${index}]` };
  }

  if (typeof entry === "string") {
    const testPath = path.resolve(suiteDir, `${entry}.json`);
    return { doc: loadJson(testPath) as ExecutableDoc, filePath: testPath };
  }

  if (isObject(entry) && typeof (entry as any).path === "string") {
    const testPath = path.resolve(suiteDir, (entry as any).path);
    return { doc: loadJson(testPath) as ExecutableDoc, filePath: testPath };
  }

  if (isObject(entry) && typeof (entry as any).ref === "string") {
    const testPath = path.resolve(suiteDir, `${(entry as any).ref}.json`);
    return { doc: loadJson(testPath) as ExecutableDoc, filePath: testPath };
  }

  throw new Error(`Invalid suite test entry at index ${index}: ${JSON.stringify(entry)}`);
}

/* ============================================================
 * Execute one test
 * ============================================================ */

async function runOneTest(params: {
  suiteId: string;
  runId: string;
  runDateFolder: string;
  suiteContext: Record<string, any>;
  suiteBaseUrl?: string;
  doc: ExecutableDoc;
  filePath: string;
  registry: Map<string, ExecutableDoc>;
  options: RunSuiteOptions;
  artifactsBaseDir: string;
  runOutDir: string;
  artifactObserver: ReturnType<typeof createArtifactObserver>;
}): Promise<TestResult> {
  const {
    suiteId,
    runId,
    runDateFolder,
    suiteContext,
    suiteBaseUrl,
    doc,
    filePath,
    registry,
    options,
    artifactsBaseDir,
    runOutDir,
    artifactObserver
  } = params;

  throwIfIssues(validateExecutableDoc(doc, filePath));
  if (doc.reusable) throw new Error(`Reusable executable cannot be run directly: ${doc.id}`);

  throwIfIssues(validateIncludesAgainstRegistry({ doc, registry, filePath }));

  const effectiveContext: Record<string, any> = {
    ...(suiteContext ?? {}),
    ...(doc.context ?? {})
  };

  const expanded = expandIncludes(
    { ...doc, reusable: false, context: effectiveContext },
    registry
  );

  throwIfIssues(
    validateInterpolationCompleteness({
      doc: expanded,
      contextKeys: new Set(Object.keys(expanded.context ?? {})),
      filePath
    })
  );

  const sandbox = options.executionMode === "stub";
  const resolvedContext = resolveRootContext({
    context: expanded.context,
    sandbox,
    injectedSecrets: parseInjectedSecrets([])
  });

  const interpolatedSteps = interpolateDeepStrict(expanded.steps, resolvedContext.values);

  const testDef: JsonTestDefinition = {
    id: expanded.id,
    steps: interpolatedSteps
  };

  const runner = new CoreRunner({
    executionMode: options.executionMode ?? "stub",
    headless: options.headless,
    slowMoMs: options.slowMoMs,
    baseUrl: options.baseUrl ?? suiteBaseUrl,
    browserName: options.browserName,
    artifacts: {
      enabled: (options.executionMode ?? "stub") !== "stub",
      dir: runOutDir,
      trace: "on-failure",
      video: "on-failure",
      screenshot: "on-failure"
    },
    artifactObserver
  });

  const testResult = await runner.run(testDef);

  const outDir = path.join(
    artifactsBaseDir,
    suiteId,
    runDateFolder,
    runId,
    testResult.projectId,
    testResult.id
  );

  new JsonReporter({ outputDir: outDir }).write("result.json", testResult);
  return testResult;
}

/* ============================================================
 * Public entrypoint
 * ============================================================ */

export async function runSuiteFromFile(inputPath: string, options: RunSuiteOptions = {}) {
  const rootPath = path.resolve(inputPath);
  const root = loadJson(rootPath);

  const artifactsBaseDir = options.artifactsDir ?? "artifacts";
  const executionType = options.executionMode === "stub" ? "stub" : "real";

  if (isSuiteDoc(root)) {
    const suite = root as SuiteDoc;
    const suiteDir = path.dirname(rootPath);

    const startedAt = nowIso();
    const runId = randomUUID();
    const runDateFolder = toDateFolder(startedAt);

    const runOutDir = path.join(artifactsBaseDir, suite.suiteId, runDateFolder, runId);
    ensureArtifactsIndex({ runOutDir, suiteId: suite.suiteId, runId });
    const artifactObserver = createArtifactObserver({ runOutDir, suiteId: suite.suiteId, runId });

    const tests: TestResult[] = [];

    for (let i = 0; i < suite.tests.length; i++) {
      const { doc, filePath } = normalizeSuiteTestEntry({
        entry: suite.tests[i],
        suiteDir,
        suiteFilePath: rootPath,
        index: i
      });

      const tr = await runOneTest({
        suiteId: suite.suiteId,
        runId,
        runDateFolder,
        suiteContext: suite.context ?? {},
        suiteBaseUrl: suite.baseUrl,
        doc,
        filePath,
        registry: loadAllExecutables(path.resolve("flows")),
        options,
        artifactsBaseDir,
        runOutDir,
        artifactObserver
      });

      tests.push(tr);
    }

    const endedAt = nowIso();

    const summary = {
      total: tests.length,
      passed: tests.filter((t) => t.result === "passed").length,
      failed: tests.filter((t) => t.result === "failed").length,
      aborted: tests.filter((t) => t.result === "aborted").length
    };

    const projectId =
      tests.length === 0
        ? options.browserName ?? "chromium"
        : tests.every((t) => t.projectId === tests[0].projectId)
        ? tests[0].projectId
        : "mixed";

    const runResult: RunResult = {
      schemaVersion: "v1",
      suiteId: suite.suiteId,
      suiteName: suite.suiteName,
      suitePath: rootPath,
      runId,
      executionType,
      executionMode: options.executionMode ?? "stub",
      projectId,
      startedAt,
      endedAt,
      durationMs: durationMs(startedAt, endedAt),
      tests,
      summary
    };

    new JsonReporter({ outputDir: runOutDir }).write("run.json", runResult);

    const artifactsDoc = loadJson(path.join(runOutDir, "artifacts.json"));
    new HtmlReporter({ outputDir: runOutDir }).write("report.html", runResult, artifactsDoc);

    const reportPath = path.resolve(runOutDir, "report.html");
    console.log("");
    console.log("Testergizer HTML report:");
    console.log(pathToFileURL(reportPath).href);
    console.log("Tip: paste the URL into your browser to view the report");
    console.log("");

    return runResult;
  }

  // Single executable path
  const startedAt = nowIso();
  const runId = randomUUID();
  const runDateFolder = toDateFolder(startedAt);

  const runOutDir = path.join(artifactsBaseDir, "single", runDateFolder, runId);
  ensureArtifactsIndex({ runOutDir, suiteId: "single", runId });
  const artifactObserver = createArtifactObserver({ runOutDir, suiteId: "single", runId });

  const tr = await runOneTest({
    suiteId: "single",
    runId,
    runDateFolder,
    suiteContext: {},
    suiteBaseUrl: undefined,
    doc: root as ExecutableDoc,
    filePath: rootPath,
    registry: loadAllExecutables(path.resolve("flows")),
    options,
    artifactsBaseDir,
    runOutDir,
    artifactObserver
  });

  const endedAt = nowIso();

  const runResult: RunResult = {
    schemaVersion: "v1",
    suiteId: "single",
    suiteName: undefined,
    suitePath: rootPath,
    runId,
    executionType,
    executionMode: options.executionMode ?? "stub",
    projectId: tr.projectId,
    startedAt,
    endedAt,
    durationMs: durationMs(startedAt, endedAt),
    tests: [tr],
    summary: {
      total: 1,
      passed: tr.result === "passed" ? 1 : 0,
      failed: tr.result === "failed" ? 1 : 0,
      aborted: tr.result === "aborted" ? 1 : 0
    }
  };

  new JsonReporter({ outputDir: runOutDir }).write("run.json", runResult);

  const artifactsDoc = loadJson(path.join(runOutDir, "artifacts.json"));
  new HtmlReporter({ outputDir: runOutDir }).write("report.html", runResult, artifactsDoc);

  const reportPath = path.resolve(runOutDir, "report.html");
  console.log("");
  console.log("Testergizer HTML report:");
  console.log(pathToFileURL(reportPath).href);
  console.log("Tip: paste the URL into your browser to view the report");
  console.log("");

  return runResult;
}
