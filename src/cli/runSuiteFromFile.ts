// src/cli/runSuiteFromFile.ts
//
// CHANGELOG (this file)
// - Added agreed executionType semantics: "debug" | "production" (stub is always debug; live can be debug or production).
// - Persisted executionType + executionSemantics consistently into run.json (schema-agnostic extras preserved).

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { pathToFileURL } from "url";

import { CoreRunner } from "../core/CoreRunner";
import { JsonReporter } from "../tools/jsonReporter";
import { HtmlReporter } from "../tools/htmlReporter";
import {
  createArtifactObserver,
  ensureArtifactsIndex
} from "../tools/artifactObserver";

import {
  resolveRootContext,
  parseInjectedSecrets,
  interpolateDeepStrict
} from "./resolveInputs";

import {
  validateExecutableDoc,
  validateInterpolationCompleteness,
  throwIfIssues
} from "./validate";

import type { ExecutableDoc } from "./validate";
import type { JsonTestDefinition, ExecutionMode } from "../core/types";
import type { RunResult, TestResult } from "../core/resultTypes";
import type { ExecutionIntent } from "../core/types";


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

  /** Runtime-only debug switch (must not affect schemas). */
  debug?: boolean;

  /**
   * NEW: Launch metadata for transparency.
   * This is a pure runtime fact and is persisted to run.json/report.
   * Must NOT affect schemas or execution semantics.
   */
  launch?: {
    command: string;
    cwd: string;
  };
}

type StepProvenance = {
  originExecutableId: string;
  originPath: string;
  reusable: boolean;
  includeStack: string[];
};

type DebugWarning = {
  originExecutableId: string;
  originPath: string;
  includeStack: string[];
  stepId: string;
  field: string;
  value: unknown;
  message: string;
};

/**
 * NEW: Runtime-only reporting channels (no schema changes).
 *
 * Contract:
 * - INVALIDATION is an authoring/compile concern, not a test result.
 * - SKIP is an intentional non-execution concern, not a test result.
 * - Therefore: neither invalid nor skipped tests appear in tests[].
 */
type InvalidTestEntry = {
  testId: string;
  testPath: string;
  phase: "compile";
  reason: string;
  stack?: string;
};

type SkippedTestEntry = {
  testId: string;
  testPath: string;
  reason?: string;
};

/**
 * Minimal SuiteDoc (group of tests), still supports inline executables for demos.
 * Canonical long-term: tests referenced by file (string / ref / path).
 */
type SuiteSkipDecl = true | { reason?: string };

// CHANGE: v1 suite tests may now declare skip at orchestration level.
// Skip is intentional non-execution; it must NOT be modeled as TestResult.
type SuiteTestRef =
  | string
  | { ref: string }
  | { path: string }
  | { ref?: string; path?: string; skip?: SuiteSkipDecl };

type SuiteTestEntry = ExecutableDoc | SuiteTestRef;

interface SuiteDoc {
  schemaVersion: "v1";
  suiteId: string;
  // applicationName is a reporting label, not a structural suite discriminator.
  // It is resolved at report time and may be omitted in the suite document.
  applicationName?: string; // 🔒 AUT – reporting label only
  suiteName?: string;
  baseUrl?: string;

  // suite-level semantic contract.
  // Defaults to false when omitted.
  // When true, suite may rely on debug semantics (literals, relaxed checks).
  debugOnly?: boolean;

  context?: Record<string, any>;
  tests: SuiteTestEntry[];
}

// Suite schema v2 (orchestration-only)
// - No execution mechanics fields.
// - Tests are references (testRef) with optional per-test params.
// - resolveFrom defines the base directory for resolving testRef paths (defaults to suite dir).
interface SuiteDocV2 {
  schemaVersion: "v2";
  suiteId: string;
  suiteName?: string;
  baseUrl?: string;
  resolveFrom?: string;

  // suite-level semantic contract.
  // Defaults to false when omitted.
  debugOnly?: boolean;

  context?: Record<string, any>;
  tests: Array<{
    id: string;
    testRef: string;
    params?: Record<string, any>;

    // NEW: orchestration-level skip (intentional non-execution)
    skip?: SuiteSkipDecl;
  }>;
}

/* ============================================================
 * Type guards
 * ============================================================ */

function isObject(v: any): v is Record<string, any> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isExecutableLike(v: any): v is ExecutableDoc {
  return (
    isObject(v) && typeof v.id === "string" && Array.isArray((v as any).steps)
  );
}

function isSuiteDoc(v: any): v is SuiteDoc {
  return (
    isObject(v) &&
    v.schemaVersion === "v1" &&
    typeof v.suiteId === "string" &&
    // removed applicationName from structural recognition.
    Array.isArray(v.tests)
  );
}

// structural recognition for Suite v2
function isSuiteDocV2(v: any): v is SuiteDocV2 {
  return (
    isObject(v) &&
    v.schemaVersion === "v2" &&
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

function loadAllExecutablesWithPaths(dir: string): {
  docs: Map<string, ExecutableDoc>;
  paths: Map<string, string>;
} {
  const docs = new Map<string, ExecutableDoc>();
  const paths = new Map<string, string>();
  if (!fs.existsSync(dir)) return { docs, paths };

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const e of entries) {
    const full = path.join(dir, e.name);

    if (e.isDirectory()) {
      const nested = loadAllExecutablesWithPaths(full);
      for (const [k, v] of nested.docs) docs.set(k, v);
      for (const [k, v] of nested.paths) paths.set(k, v);
    } else if (e.isFile() && e.name.endsWith(".json")) {
      const doc = loadJson(full) as ExecutableDoc;
      if (docs.has(doc.id)) throw new Error(`Duplicate executable id: ${doc.id}`);
      docs.set(doc.id, doc);
      paths.set(doc.id, path.resolve(full));
    }
  }

  return { docs, paths };
}

function isIncludeStep(step: any): step is { type: "include"; ref: string } {
  return (
    !!step &&
    typeof step === "object" &&
    step.type === "include" &&
    typeof step.ref === "string"
  );
}

function containsInterpolation(s: string): boolean {
  return /\{\{[A-Z][A-Z0-9_]*\}\}/.test(s);
}

function isLikelyPathRef(ref: string): boolean {
  // If it looks like a file path, treat it as such. Otherwise fall back to registry ID.
  return (
    ref.includes("/") ||
    ref.includes("\\") ||
    ref.endsWith(".json") ||
    ref.startsWith(".")
  );
}

function isAbsoluteHttpUrl(s: string): boolean {
  // We only treat absolute http(s) URLs as "environment-coupled literals".
  // Relative paths like "/" or "/inventory.html" are allowed in reusables.
  return /^https?:\/\//i.test(s);
}

/**
 * CI detection: keep it simple and deterministic.
 * - CI systems commonly set process.env.CI="true".
 * - We intentionally DO NOT try to infer "interactive" via TTY heuristics here.
 */
function isCiEnvironment(): boolean {
  const v = process.env.CI;
  return typeof v === "string" && v.toLowerCase() === "true";
}

/**
 * Determine the effective debug semantics for this run.
 *
 * Contract:
 * 1) suite.debugOnly defaults to false when omitted.
 * 2) stub execution implies debug semantics (stub is debugOnly by default).
 * 3) suite.debugOnly=true requires debug semantics. In CI, debug must be explicit.
 */
function computeEffectiveDebug(params: {
  executionMode: ExecutionMode;
  suiteDebugOnly: boolean;
  userDebugFlag: boolean;
  ci: boolean;
  suiteId: string;
}): { effectiveDebug: boolean; debugForced: boolean } {
  const { executionMode, suiteDebugOnly, userDebugFlag, ci, suiteId } = params;

  // Stub runs are debug-only by definition.
  if (executionMode === "stub") {
    return { effectiveDebug: true, debugForced: false };
  }

  // If user explicitly requests debug semantics, honor it.
  if (userDebugFlag) {
    return { effectiveDebug: true, debugForced: false };
  }

  // If suite declares debugOnly, we require debug semantics.
  if (suiteDebugOnly) {
    if (ci) {
      // In CI, no implicit switching: require explicit --debug.
      throw new Error(`debugOnly suite "${suiteId}" cannot run in CI without --debug`);
    }

    // Local convenience: force debug semantics with loud warning.
    console.warn("");
    console.warn(`⚠️  Suite "${suiteId}" declares debugOnly=true but --debug was not provided.`);
    console.warn("⚠️  Forcing DEBUG semantics for this run.");
    console.warn("");

    return { effectiveDebug: true, debugForced: true };
  }

  // Default: production semantics.
  return { effectiveDebug: false, debugForced: false };
}

function validateReusablePurity(params: {
  reusableDoc: ExecutableDoc;
  reusablePath: string;
  debug: boolean;
  includeStack: string[];
  warnings: DebugWarning[];
}) {
  const { reusableDoc, reusablePath, debug, includeStack, warnings } = params;

  // Purity rule is intentionally narrow:
  // - For goto.target: absolute URLs are disallowed (unless debug semantics are enabled).
  //   Relative navigation ("/", "/path") is allowed because it is environment-agnostic and relies on runner baseUrl.
  // - For fill.value: literal inputs are disallowed (unless debug semantics are enabled) because they are data-coupled.
  for (const step of reusableDoc.steps ?? []) {
    const stepId = typeof step?.id === "string" ? step.id : "(missing-id)";

    if (step?.action === "goto") {
      const v = step.target;

      if (typeof v === "string" && !containsInterpolation(v)) {
        const isAbsolute = isAbsoluteHttpUrl(v);

        if (isAbsolute) {
          if (!debug) {
            throw new Error(
              `Reusable "${reusableDoc.id}" contains absolute goto.target at step "${stepId}" (use relative paths like "/" or "/inventory.html", or enable --debug for temporary literal use).`
            );
          }

          warnings.push({
            originExecutableId: reusableDoc.id,
            originPath: reusablePath,
            includeStack,
            stepId,
            field: "goto.target",
            value: v,
            message: "Absolute URL allowed only because debug semantics are enabled"
          });
        }
      }
    }

    if (step?.action === "fill") {
      const v = step.value;

      if (typeof v === "string" && !containsInterpolation(v)) {
        if (!debug) {
          throw new Error(
            `Reusable "${reusableDoc.id}" contains literal fill.value at step "${stepId}" (use {{USERNAME}} or similar, or enable --debug for temporary literal use).`
          );
        }

        warnings.push({
          originExecutableId: reusableDoc.id,
          originPath: reusablePath,
          includeStack,
          stepId,
          field: "fill.value",
          value: v,
          message: "Literal input allowed only because debug semantics are enabled"
        });
      }
    }
  }
}

/**
 * Include expansion is linear and deterministic.
 */
function expandIncludesWithProvenance(params: {
  root: ExecutableDoc;
  rootPath: string;
  registry: Map<string, ExecutableDoc>;
  registryPaths: Map<string, string>;
  debug: boolean;
  warnings: DebugWarning[];
  provenanceByStepId: Record<string, StepProvenance>;
}): ExecutableDoc {
  const { root, rootPath, registry, registryPaths, debug, warnings, provenanceByStepId } =
    params;

  const expandedSteps: any[] = [];
  const rootIncludeStack = [root.id];

  for (const step of root.steps) {
    if (isIncludeStep(step)) {
      const ref = step.ref;

      let target: ExecutableDoc | undefined;
      let targetPath: string | undefined;

      if (!isLikelyPathRef(ref)) {
        target = registry.get(ref);
        targetPath = registryPaths.get(ref);
      }

      if (!target) {
        // Path-based include (relative to the including executable file)
        if (rootPath.includes("#")) {
          throw new Error(
            `Path-based include "${ref}" cannot be resolved from an inline suite executable. Move the executable into a real file.`
          );
        }
        const incAbs = path.resolve(path.dirname(rootPath), ref);
        if (!fs.existsSync(incAbs)) {
          throw new Error(`Include reference not found: ${ref} (resolved: ${incAbs})`);
        }
        target = loadJson(incAbs) as ExecutableDoc;
        targetPath = incAbs;
      }

      if (!targetPath) targetPath = `registry:${ref}`;

      if (!target.reusable) throw new Error(`Include target is not reusable: ${ref}`);
      if (target.steps.some((s) => isIncludeStep(s))) {
        throw new Error(`Reusable "${target.id}" must not contain include steps`);
      }

      const includeStack = [...rootIncludeStack, target.id];
      validateReusablePurity({
        reusableDoc: target,
        reusablePath: targetPath,
        debug,
        includeStack,
        warnings
      });

      for (const s of target.steps) {
        expandedSteps.push(s);
        const sid = typeof s?.id === "string" ? s.id : "(missing-id)";
        provenanceByStepId[sid] = {
          originExecutableId: target.id,
          originPath: targetPath,
          reusable: true,
          includeStack
        };
      }
    } else {
      expandedSteps.push(step);
      const sid = typeof step?.id === "string" ? step.id : "(missing-id)";
      provenanceByStepId[sid] = {
        originExecutableId: root.id,
        originPath: rootPath,
        reusable: false,
        includeStack: rootIncludeStack
      };
    }
  }

  return {
    id: root.id,
    reusable: false,
    context: root.context,
    steps: expandedSteps
  };
}

function parseSkipDecl(v: any): { skip: boolean; reason?: string } {
  if (v === true) return { skip: true };
  if (isObject(v)) {
    const r = typeof (v as any).reason === "string" ? (v as any).reason : undefined;
    return { skip: true, reason: r };
  }
  return { skip: false };
}

/**
 * Normalize Suite v1 test entries.
 *
 * Contract:
 * - If an entry declares skip, it must resolve to a path (ref or path) so we can report testPath.
 * - Skipped tests are NOT loaded, validated, or executed.
 */
function normalizeSuiteTestEntry(params: {
  entry: SuiteTestEntry;
  suiteDir: string;
  suiteFilePath: string;
  index: number;
}): { doc?: ExecutableDoc; filePath: string; skip?: { reason?: string } } {
  const { entry, suiteDir, suiteFilePath, index } = params;

  // Inline executables cannot be skipped by ref/path; if you want skip, use a referenced entry.
  if (isExecutableLike(entry)) {
    return { doc: entry, filePath: `${suiteFilePath}#tests[${index}]` };
  }

  if (typeof entry === "string") {
    const testPath = path.resolve(suiteDir, `${entry}.json`);
    return { doc: loadJson(testPath) as ExecutableDoc, filePath: testPath };
  }

  // Object forms
  if (isObject(entry)) {
    const maybeSkip = parseSkipDecl((entry as any).skip);
    const hasSkip = maybeSkip.skip;

    // Determine resolved file path (required for skip reporting too)
    const hasPath = typeof (entry as any).path === "string";
    const hasRef = typeof (entry as any).ref === "string";

    if (hasSkip) {
      if (!hasPath && !hasRef) {
        throw new Error(
          `Suite v1 skip entry must provide "path" or "ref" at index ${index}: ${JSON.stringify(
            entry
          )}`
        );
      }

      const filePath = hasPath
        ? path.resolve(suiteDir, (entry as any).path)
        : path.resolve(suiteDir, `${(entry as any).ref}.json`);

      return { doc: undefined, filePath, skip: { reason: maybeSkip.reason } };
    }

    // Non-skip normal forms
    if (hasPath) {
      const testPath = path.resolve(suiteDir, (entry as any).path);
      return { doc: loadJson(testPath) as ExecutableDoc, filePath: testPath };
    }

    if (hasRef) {
      const testPath = path.resolve(suiteDir, `${(entry as any).ref}.json`);
      return { doc: loadJson(testPath) as ExecutableDoc, filePath: testPath };
    }
  }

  throw new Error(
    `Invalid suite test entry at index ${index}: ${JSON.stringify(entry)}`
  );
}

// Normalize Suite v2 entry (path resolution + validation)
//
// Contract:
// - Skipped tests are NOT loaded, validated, or executed.
// - We still resolve testPath for reporting.
function normalizeSuiteV2TestEntry(params: {
  entry: SuiteDocV2["tests"][number];
  resolveBase: string;
}): {
  doc?: ExecutableDoc;
  filePath: string;
  testId: string;
  testParams?: Record<string, any>;
  skip?: { reason?: string };
} {
  const { entry, resolveBase } = params;

  if (!entry || typeof entry !== "object") {
    throw new Error(`Invalid suite v2 test entry: ${JSON.stringify(entry)}`);
  }
  if (typeof entry.id !== "string" || !entry.id.trim()) {
    throw new Error(`Suite v2 test entry is missing a non-empty id: ${JSON.stringify(entry)}`);
  }
  if (typeof entry.testRef !== "string" || !entry.testRef.trim()) {
    throw new Error(`Suite v2 test entry is missing a non-empty testRef: ${JSON.stringify(entry)}`);
  }

  const filePath = path.resolve(resolveBase, entry.testRef);

  const maybeSkip = parseSkipDecl((entry as any).skip);
  if (maybeSkip.skip) {
    return {
      doc: undefined,
      filePath,
      testId: entry.id,
      testParams: entry.params,
      skip: { reason: maybeSkip.reason }
    };
  }

  return {
    doc: loadJson(filePath) as ExecutableDoc,
    filePath,
    testId: entry.id,
    testParams: entry.params
  };
}

function safeString(v: unknown): string {
  try {
    if (typeof v === "string") return v;
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function errorMessage(err: any): string {
  return safeString(err?.message ?? err);
}

function errorStack(err: any): string | undefined {
  return typeof err?.stack === "string" ? err.stack : undefined;
}

/* ============================================================
 * Execute one test
 * ============================================================ */

async function runOneTest(params: {
  suiteId: string;
  runId: string;
  runDateFolder: string;
  suiteContext: Record<string, any>;
  // optional per-test context overlay (used by Suite v2 params)
  testContext?: Record<string, any>;
  suiteBaseUrl?: string;
  doc: ExecutableDoc;
  filePath: string;
  registry: Map<string, ExecutableDoc>;
  registryPaths: Map<string, string>;
  options: RunSuiteOptions;
  artifactsBaseDir: string;
  runOutDir: string;
  artifactObserver: ReturnType<typeof createArtifactObserver>;
}): Promise<{
  testResult: TestResult;
  provenanceByStepId: Record<string, StepProvenance>;
  debugWarnings: DebugWarning[];
}> {
  const {
    suiteId,
    runId,
    runDateFolder,
    suiteContext,
    suiteBaseUrl,
    doc,
    filePath,
    registry,
    registryPaths,
    options,
    artifactsBaseDir,
    runOutDir,
    artifactObserver
  } = params;

  throwIfIssues(validateExecutableDoc(doc, filePath));
  if (doc.reusable) throw new Error(`Reusable executable cannot be run directly: ${doc.id}`);

  // Merge optional per-test context (Suite v2 params) without altering v1 behavior.
  const effectiveContext: Record<string, any> = {
    ...(suiteContext ?? {}),
    ...(params.testContext ?? {}),
    ...(doc.context ?? {})
  };

  const debugWarnings: DebugWarning[] = [];
  const provenanceByStepId: Record<string, StepProvenance> = {};

  const expanded = expandIncludesWithProvenance({
    root: { ...doc, reusable: false, context: effectiveContext },
    rootPath: filePath,
    registry,
    registryPaths,
    debug: options.debug === true,
    warnings: debugWarnings,
    provenanceByStepId
  });

  // Contract: In debug semantics (including stub), we do not hard-fail on missing interpolation.
  // This preserves exploratory workflows while keeping production runs strict.
  if (options.debug !== true) {
    throwIfIssues(
      validateInterpolationCompleteness({
        doc: expanded,
        contextKeys: new Set(Object.keys(expanded.context ?? {})),
        filePath
      })
    );
  }

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
  return { testResult, provenanceByStepId, debugWarnings };
}

/* ============================================================
 * Public entrypoint
 * ============================================================ */

export async function runSuiteFromFile(inputPath: string, options: RunSuiteOptions = {}) {
  const rootPath = path.resolve(inputPath);
  const root = loadJson(rootPath);

  const artifactsBaseDir = options.artifactsDir ?? "artifacts";
  const ci = isCiEnvironment();

  if (isSuiteDoc(root)) {
    const suite = root as SuiteDoc;

    // Contract: debugOnly defaults to false when omitted.
    const suiteDebugOnly = suite.debugOnly === true;

    // Contract: stub implies debug semantics (stub is debugOnly by default).
    const execMode: ExecutionMode = options.executionMode ?? "stub";
    const { effectiveDebug, debugForced } = computeEffectiveDebug({
      executionMode: execMode,
      suiteDebugOnly,
      userDebugFlag: options.debug === true,
      ci,
      suiteId: suite.suiteId
    });

    // CHANGE: explicit axis label for conversational semantics (schema-agnostic).
    const executionType: "stub" | "live" = execMode === "stub" ? "stub" : "live";

    // CHANGE: validationMode instead of the wrong executionType.
    const validationMode: "debug" | "prod" = effectiveDebug ? "debug" : "prod";

    const executionIntent: ExecutionIntent =
      execMode === "stub"
      ? "stub"
      : execMode === "baseline"
      ? "baseline"
      : "verify";


    // IMPORTANT: do not mutate caller-supplied object.
    const effectiveOptions: RunSuiteOptions = {
      ...options,
      executionMode: execMode,
      debug: effectiveDebug
    };

    const suiteDir = path.dirname(rootPath);

    const startedAt = nowIso();
    const runId = randomUUID();
    const runDateFolder = toDateFolder(startedAt);

    const runOutDir = path.join(artifactsBaseDir, suite.suiteId, runDateFolder, runId);
    ensureArtifactsIndex({ runOutDir, suiteId: suite.suiteId, runId });
    const artifactObserver = createArtifactObserver({ runOutDir, suiteId: suite.suiteId, runId });

    const tests: TestResult[] = [];
    const provenanceByTestId: Record<string, Record<string, StepProvenance>> = {};
    const debugWarningsAll: DebugWarning[] = [];

    // NEW: runtime-only reporting channels (not schemas).
    const invalidTests: InvalidTestEntry[] = [];
    const skippedTests: SkippedTestEntry[] = [];

    // Registry of reusable executables (legacy: flows/ by ID). Path-based includes are also supported.
    const flowsDir = path.resolve(process.cwd(), "flows");
    const flows = loadAllExecutablesWithPaths(flowsDir);

    // Execution loop (v1)
    for (let i = 0; i < suite.tests.length; i++) {
      let normalized:
        | { doc?: ExecutableDoc; filePath: string; skip?: { reason?: string } }
        | undefined;

      try {
        normalized = normalizeSuiteTestEntry({
          entry: suite.tests[i],
          suiteDir,
          suiteFilePath: rootPath,
          index: i
        });

        // CONTRACT: skip is intentional non-execution. It does not validate or execute.
        if (normalized.skip) {
          const sid = normalized.filePath
            ? path.basename(normalized.filePath)
            : `skipped-test-${i + 1}`;

          skippedTests.push({
            testId: sid,
            testPath: normalized.filePath,
            reason: normalized.skip.reason
          });
          continue;
        }

        if (!normalized.doc) {
          // Defensive: should not happen without skip, but keep run continuous.
          throw new Error(`Suite v1 entry normalized without doc and without skip at index ${i}`);
        }

        const { doc, filePath } = normalized;

        const { testResult: tr, provenanceByStepId, debugWarnings } = await runOneTest({
          testContext: undefined, // v1 has no per-test params
          suiteId: suite.suiteId,
          runId,
          runDateFolder,
          suiteContext: suite.context ?? {},
          suiteBaseUrl: suite.baseUrl,
          doc,
          filePath,
          registry: flows.docs,
          registryPaths: flows.paths,
          options: effectiveOptions,
          artifactsBaseDir,
          runOutDir,
          artifactObserver
        });

        tests.push(tr);
        provenanceByTestId[tr.id] = provenanceByStepId;
        debugWarningsAll.push(...debugWarnings);
      } catch (err: any) {
        // CONTRACT: invalidation is compile/authoring concern, not a TestResult.
        const fallbackPath =
          normalized?.filePath ?? `${rootPath}#tests[${i}]`;

        const fallbackId =
          (normalized?.doc && typeof normalized.doc.id === "string" && normalized.doc.id) ||
          `invalid-test-${i + 1}`;

        invalidTests.push({
          testId: fallbackId,
          testPath: fallbackPath,
          phase: "compile",
          reason: `Validation/prepare failed: ${errorMessage(err)}`,
          stack: errorStack(err)
        });

        // Minimal provenance slot so downstream consumers don't crash on missing keys.
        provenanceByTestId[fallbackId] = {};
        continue;
      }
    }

    const endedAt = nowIso();

    // Summary is execution-only (tests[] only).
    const summary = {
      total: tests.length,
      passed: tests.filter((t) => t.result === "passed").length,
      failed: tests.filter((t) => t.result === "failed").length,
      aborted: tests.filter((t) => t.result === "aborted").length
    };

    const projectId =
      tests.length === 0
        ? effectiveOptions.browserName ?? "chromium"
        : tests.every((t) => t.projectId === tests[0].projectId)
        ? tests[0].projectId
        : "mixed";

    const runResult: RunResult = {
      schemaVersion: "v1",
      suiteId: suite.suiteId,
      suiteName: suite.suiteName,
      suitePath: rootPath,
      applicationName: suite.applicationName ?? suite.suiteName ?? suite.suiteId,
      runId,
      executionType,      // "stub" | "live"
      validationMode,     // "debug" | "prod"
      executionIntent,    // "stub" | "verify" | "baseline"
      projectId,
      startedAt,
      endedAt,
      durationMs: durationMs(startedAt, endedAt),
      tests,
      summary
    };

    // Runtime metadata (kept out of schemas; consumers may use it if present).
    (runResult as any).debugOnly = suiteDebugOnly || execMode === "stub";
    (runResult as any).debugForced = debugForced;
    (runResult as any).ci = ci === true;

    // Launch transparency (if provided by CLI/programmatic caller)
    if (effectiveOptions.launch?.command) {
      (runResult as any).launch = {
        command: effectiveOptions.launch.command,
        cwd: effectiveOptions.launch.cwd
      };
    }

    // NEW: invalidation and skip channels (schema-agnostic).
    (runResult as any).invalidation = {
      count: invalidTests.length,
      tests: invalidTests
    };
    (runResult as any).skipped = {
      count: skippedTests.length,
      tests: skippedTests
    };

    new JsonReporter({ outputDir: runOutDir }).write("run.json", runResult);

    // Runtime-only compiler metadata (no schema changes).
    const provenancePath = path.join(runOutDir, "provenance.json");
    fs.writeFileSync(
      provenancePath,
      JSON.stringify({ schemaVersion: "v1", byTestId: provenanceByTestId }, null, 2),
      "utf-8"
    );

    // Emit debug warnings file only when debug semantics are enabled and warnings exist.
    if (effectiveOptions.debug === true && debugWarningsAll.length > 0) {
      const warningsPath = path.join(runOutDir, "debug-warnings.json");
      fs.writeFileSync(
        warningsPath,
        JSON.stringify({ schemaVersion: "v1", warnings: debugWarningsAll }, null, 2),
        "utf-8"
      );

      console.warn("\n⚠️  DEBUG SEMANTICS — reusable purity checks relaxed\n");
      for (const w of debugWarningsAll) {
        console.warn(
          `⚠️  [${w.originExecutableId}] ${w.field} (step: ${w.stepId}) — ${w.message} — ${w.originPath} — stack: ${w.includeStack.join(
            " → "
          )}`
        );
      }
      console.warn("");
    }

    const artifactsDoc = loadJson(path.join(runOutDir, "artifacts.json"));
    new HtmlReporter({ outputDir: runOutDir }).write(runResult, artifactsDoc);

    const reportPath = path.resolve(runOutDir, "report.html");
    console.log("");
    console.log("Testergizer HTML report:");
    console.log(pathToFileURL(reportPath).href);
    console.log("Tip: paste the URL into your browser to view the report");
    console.log("");

    return runResult;
  }

  // Suite v2 orchestration support (no schema corruption; runtime only)
  if (isSuiteDocV2(root)) {
    const suite = root as SuiteDocV2;

    // Contract: debugOnly defaults to false when omitted.
    const suiteDebugOnly = suite.debugOnly === true;

    // Contract: stub implies debug semantics (stub is debugOnly by default).
    const execMode: ExecutionMode = options.executionMode ?? "stub";
    const { effectiveDebug, debugForced } = computeEffectiveDebug({
      executionMode: execMode,
      suiteDebugOnly,
      userDebugFlag: options.debug === true,
      ci,
      suiteId: suite.suiteId
    });

    // CHANGE: explicit axis label for conversational semantics (schema-agnostic).
    const executionType: "stub" | "live" = execMode === "stub" ? "stub" : "live";

    // CHANGE: validationMode instead of the wrong executionType.
    const validationMode: "debug" | "prod" = effectiveDebug ? "debug" : "prod";

    const executionIntent: ExecutionIntent =
      execMode === "stub"
        ? "stub"
        : execMode === "baseline"
        ? "baseline"
        : "verify";


    const effectiveOptions: RunSuiteOptions = {
      ...options,
      executionMode: execMode,
      debug: effectiveDebug
    };

    const suiteDir = path.dirname(rootPath);
    const resolveBase = suite.resolveFrom
      ? path.resolve(suiteDir, suite.resolveFrom)
      : suiteDir;

    const startedAt = nowIso();
    const runId = randomUUID();
    const runDateFolder = toDateFolder(startedAt);

    const runOutDir = path.join(artifactsBaseDir, suite.suiteId, runDateFolder, runId);
    ensureArtifactsIndex({ runOutDir, suiteId: suite.suiteId, runId });
    const artifactObserver = createArtifactObserver({ runOutDir, suiteId: suite.suiteId, runId });

    const tests: TestResult[] = [];
    const provenanceByTestId: Record<string, Record<string, StepProvenance>> = {};
    const debugWarningsAll: DebugWarning[] = [];

    // NEW: runtime-only reporting channels (not schemas).
    const invalidTests: InvalidTestEntry[] = [];
    const skippedTests: SkippedTestEntry[] = [];

    // Registry of reusable executables (flows/ by ID). Path-based includes are also supported.
    const flowsDir = path.resolve(process.cwd(), "flows");
    const flows = loadAllExecutablesWithPaths(flowsDir);

    // Execution loop (v2)
    for (let i = 0; i < suite.tests.length; i++) {
      let normalized:
        | {
            doc?: ExecutableDoc;
            filePath: string;
            testId: string;
            testParams?: Record<string, any>;
            skip?: { reason?: string };
          }
        | undefined;

      try {
        normalized = normalizeSuiteV2TestEntry({
          entry: suite.tests[i],
          resolveBase
        });

        // CONTRACT: skip is intentional non-execution. It does not validate or execute.
        if (normalized.skip) {
          skippedTests.push({
            testId: normalized.testId,
            testPath: normalized.filePath,
            reason: normalized.skip.reason
          });
          continue;
        }

        if (!normalized.doc) {
          // Defensive: should not happen without skip, but keep run continuous.
          throw new Error(`Suite v2 entry normalized without doc and without skip at index ${i}`);
        }

        const { doc, filePath, testId, testParams } = normalized;

        const { testResult: tr, provenanceByStepId, debugWarnings } = await runOneTest({
          suiteId: suite.suiteId,
          runId,
          runDateFolder,
          suiteContext: suite.context ?? {},
          testContext: testParams ?? {},
          suiteBaseUrl: suite.baseUrl,
          doc,
          filePath,
          registry: flows.docs,
          registryPaths: flows.paths,
          options: effectiveOptions,
          artifactsBaseDir,
          runOutDir,
          artifactObserver
        });

        // Suite-level orchestration id takes precedence in reporting.
        if (testId && testId !== tr.id) {
          tr.id = testId;
        }

        tests.push(tr);

        provenanceByTestId[tr.id] = provenanceByStepId;
        debugWarningsAll.push(...debugWarnings);
      } catch (err: any) {
        const fallbackId = normalized?.testId ?? `invalid-test-${i + 1}`;
        const fallbackPath =
          normalized?.filePath ?? `${rootPath}#tests[${i}]`;

        invalidTests.push({
          testId: fallbackId,
          testPath: fallbackPath,
          phase: "compile",
          reason: `Validation/prepare failed: ${errorMessage(err)}`,
          stack: errorStack(err)
        });

        provenanceByTestId[fallbackId] = {};
        continue;
      }
    }

    const endedAt = nowIso();

    // Summary is execution-only (tests[] only).
    const summary = {
      total: tests.length,
      passed: tests.filter((t) => t.result === "passed").length,
      failed: tests.filter((t) => t.result === "failed").length,
      aborted: tests.filter((t) => t.result === "aborted").length
    };

    const projectId =
      tests.length === 0
        ? effectiveOptions.browserName ?? "chromium"
        : tests.every((t) => t.projectId === tests[0].projectId)
        ? tests[0].projectId
        : "mixed";

    // applicationName for reporting (Suite v2 does not require it)
    const applicationName = (root as any).applicationName ?? suite.suiteName ?? suite.suiteId;

    const runResult: RunResult = {
      schemaVersion: "v1",
      suiteId: suite.suiteId,
      suiteName: suite.suiteName,
      suitePath: rootPath,
      applicationName,
      runId,
      executionType,      // "stub" | "live"
      validationMode,     // "debug" | "prod"
      executionIntent,    // "stub" | "verify" | "baseline"
      projectId,
      startedAt,
      endedAt,
      durationMs: durationMs(startedAt, endedAt),
      tests,
      summary
    };


    (runResult as any).debugOnly = suiteDebugOnly || execMode === "stub";
    (runResult as any).debugForced = debugForced;
    (runResult as any).ci = ci === true;

    if (effectiveOptions.launch?.command) {
      (runResult as any).launch = {
        command: effectiveOptions.launch.command,
        cwd: effectiveOptions.launch.cwd
      };
    }

    // NEW: invalidation and skip channels (schema-agnostic).
    (runResult as any).invalidation = {
      count: invalidTests.length,
      tests: invalidTests
    };
    (runResult as any).skipped = {
      count: skippedTests.length,
      tests: skippedTests
    };

    new JsonReporter({ outputDir: runOutDir }).write("run.json", runResult);

    const provenancePath = path.join(runOutDir, "provenance.json");
    fs.writeFileSync(
      provenancePath,
      JSON.stringify({ schemaVersion: "v1", byTestId: provenanceByTestId }, null, 2),
      "utf-8"
    );

    if (effectiveOptions.debug === true && debugWarningsAll.length > 0) {
      const warningsPath = path.join(runOutDir, "debug-warnings.json");
      fs.writeFileSync(
        warningsPath,
        JSON.stringify({ schemaVersion: "v1", warnings: debugWarningsAll }, null, 2),
        "utf-8"
      );

      console.warn("\n⚠️  DEBUG SEMANTICS — reusable purity checks relaxed\n");
      for (const w of debugWarningsAll) {
        console.warn(
          `⚠️  [${w.originExecutableId}] ${w.field} (step: ${w.stepId}) — ${w.message} — ${w.originPath} — stack: ${w.includeStack.join(
            " → "
          )}`
        );
      }
      console.warn("");
    }

    const artifactsDoc = loadJson(path.join(runOutDir, "artifacts.json"));
    new HtmlReporter({ outputDir: runOutDir }).write(runResult, artifactsDoc);

    const reportPath = path.resolve(runOutDir, "report.html");
    console.log("");
    console.log("Testergizer HTML report:");
    console.log(pathToFileURL(reportPath).href);
    console.log("Tip: paste the URL into your browser to view the report");
    console.log("");

    return runResult;
  }

  // Honest error message (no mention of applicationName).
  throw new Error("Single executable runs must be wrapped in a suite");
}
