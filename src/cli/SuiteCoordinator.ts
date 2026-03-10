// src/cli/SuiteCoordinator.ts
//
// CHANGELOG (this file)
//
// - Replaced legacy executionMode / executionType semantics with the new
//   three-axis model:
//     executionEngine   ("testergizer" | "playwright")
//     executionIntent   ("review" | "verify" | "baseline")
//     validationMode    ("debug" | "strict")
//
// - Removed all references to "model", "live", and "production" terminology.
//   Engine now defines execution mechanics; intent defines purpose;
//   validationMode defines semantic strictness.
//
// - Persist executionEngine, executionIntent, and validationMode
//   consistently into run.json (schema-aligned).
//
// - NEW (2026-02-11): Deterministic runtime-only auto step IDs:
//   - Any step missing `id` is assigned a stable deterministic id.
//   - No schema change.
//   - Fixes "(missing-id)" warnings and empty data-step-id in HTML report.
//
// - NEW (2026-02-11): Fixed Suite v2 branch referencing `resolvedBaseUrl`
//   before initialization.
//
// - SPRINT 7: Integrated DataMatrixResolver for Data Variance.
//   Bypasses legacy schema validation to preserve matrix routing properties.
//   Hoisted matrix unrolling to the Compile Phase so Orchestrator can natively
//   distribute unrolled testlets across parallel workers.
//
// - SPRINT 7 PATCH: Inject explicit worker count into RunResult payload for 
//   strict execution transparency.
//
// - SPRINT 7 HOTFIX: Ensure testDomain is strictly preserved during matrix 
//   unrolling to maintain UI boundary rendering mechanics. Harvest debug 
//   warnings during Compile Phase to prevent worker duplication.
//
// - SPRINT 7 COMPILER PATCH: Map declarative matrix expectations into 
//   actionable execution steps prior to interpolation.

import os from "os";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { pathToFileURL } from "url";

import { evaluateVersionCompatibility } from "../core/locators/ctrVersionGuard";
import { TestExecutor } from "../core/TestExecutor";
import { DataMatrixResolver } from "../core/DataMatrixResolver";
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
import type { JsonTestDefinition, ExecutionEngine, ExecutionIntent, ValidationMode, UnrolledTestlet } from "../core/types";
import type { RunResult, RunSummary, TestResult } from "../core/resultTypes";
import { Orchestrator } from "../core/orchestration/Orchestrator";
import type { ScheduledTask } from "../core/orchestration/types";


/**
 * Public, frozen API.
 * Used by platform tests and programmatic callers.
 * DO NOT change this signature.
 */
export interface RunSuiteOptions {
  executionEngine?: ExecutionEngine;
  executionIntent?: ExecutionIntent;
  validationMode?: ValidationMode;

  artifactsDir?: string;

  // Forwarded to CoreRunner
  headless?: boolean;
  slowMoMs?: number;
  baseUrl?: string;

  /** Playwright project semantics (for now: browser family) */
  browserName?: "chromium" | "firefox" | "webkit";

  /** Runtime-only debug switch (must not affect schemas). */
  debug?: boolean;
  retries?: number;

  /**
   * NEW: AUT version for CTR governance.
   * If not provided, may fall back to suite JSON.
   */
  autVersion?: string;

  /**
   * Launch metadata (transparency only).
   */
  launch?: {
    command: string;
    cwd: string;
  };

    /**
   * Suite-level parallelism (orchestration workers).
   * If undefined -> sequential for now.
   */
  workers?: number;
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
  autVersion?: string;
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
  autVersion?: string;


  // suite-level semantic contract.
  // Defaults to false when omitted.
  debugOnly?: boolean;

  /*
  * Number of additional attempts after the first.
  * Example: retries=1 means up to 2 attempts.
  */
  retries?: number;

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
 * Deterministic runtime-only auto step ids.
 *
 * Contract:
 * - Does NOT change schemas.
 * - Does NOT require authors to add ids.
 * - Produces stable ids for reporting + warnings.
 *
 * Format:
 * <executableId>::<NNN>::<action>
 * Example:
 * login-literals::001::goto
 */
function ensureStepIds(params: {
  executableId: string;
  steps: any[];
}): void {
  const { executableId, steps } = params;

  for (let i = 0; i < (steps ?? []).length; i++) {
    const s = steps[i];
    if (!s || typeof s !== "object") continue;

    const current = (s as any).id;
    if (typeof current === "string" && current.trim()) continue;

    const nnn = String(i + 1).padStart(3, "0");
    const action = typeof (s as any).action === "string" && (s as any).action.trim()
      ? (s as any).action.trim()
      : "step";

    (s as any).id = `${executableId}::${nnn}::${action}`;
  }
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
  executionEngine: ExecutionEngine;
  suiteDebugOnly: boolean;
  userDebugFlag: boolean;
  ci: boolean;
  suiteId: string;
}): { effectiveDebug: boolean; debugForced: boolean } {
  const {
    executionEngine,
    suiteDebugOnly,
    userDebugFlag,
    ci,
    suiteId
  } = params;

  // 1️⃣ Model engine defaults to debug semantics.
  if (executionEngine === "testergizer") {
    return { effectiveDebug: true, debugForced: false };
  }

  // 2️⃣ Explicit user override.
  if (userDebugFlag) {
    return { effectiveDebug: true, debugForced: false };
  }

  // 3️⃣ Suite-enforced debug.
  if (suiteDebugOnly) {
    if (ci) {
      throw new Error(
        `debugOnly suite "${suiteId}" cannot run in CI without --debug`
      );
    }

    console.warn("");
    console.warn(
      `⚠️  Suite "${suiteId}" declares debugOnly=true but --debug was not provided.`
    );
    console.warn("⚠️  Forcing DEBUG semantics for this run.");
    console.warn("");

    return { effectiveDebug: true, debugForced: true };
  }

  // 4️⃣ Default for live engine.
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

  // Ensure warning stepIds are never "(missing-id)".
  ensureStepIds({ executableId: reusableDoc.id, steps: (reusableDoc.steps ?? []) as any[] });

  // Purity rule is intentionally narrow:
  // - For goto.target: absolute URLs are disallowed (unless debug semantics are enabled).
  //   Relative navigation ("/", "/path") is allowed because it is environment-agnostic and relies on runner baseUrl.
  // - For fill.value: literal inputs are disallowed (unless debug semantics are enabled) because they are data-coupled.
  for (const step of reusableDoc.steps ?? []) {
    const stepId = typeof step?.id === "string" ? step.id : "(missing-id)";

    if (step?.action === "goto") {
      const v = (step as any).target;

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
      const v = (step as any).value;

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

function expandIncludesWithProvenance(params: {
  root: ExecutableDoc;
  rootPath: string;
  registry: Map<string, ExecutableDoc>;
  registryPaths: Map<string, string>;
  debug: boolean;
  warnings: DebugWarning[];
  provenanceByStepId: Record<string, StepProvenance>;
}): ExecutableDoc {
  const {
    root,
    rootPath,
    registry,
    registryPaths,
    debug,
    warnings,
    provenanceByStepId
  } = params;

  // Ensure root steps have deterministic ids
  ensureStepIds({
    executableId: root.id,
    steps: (root.steps ?? []) as any[]
  });

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
        if (rootPath.includes("#")) {
          throw new Error(
            `Path-based include "${ref}" cannot be resolved from an inline suite executable. Move the executable into a real file.`
          );
        }

        const incAbs = path.resolve(path.dirname(rootPath), ref);
        if (!fs.existsSync(incAbs)) {
          throw new Error(
            `Include reference not found: ${ref} (resolved: ${incAbs})`
          );
        }

        target = loadJson(incAbs) as ExecutableDoc;
        targetPath = incAbs;
      }

      if (!targetPath) targetPath = `registry:${ref}`;

      if (!target.reusable) {
        throw new Error(`Include target is not reusable: ${ref}`);
      }

      if (target.steps.some((s) => isIncludeStep(s))) {
        throw new Error(
          `Reusable "${target.id}" must not contain include steps`
        );
      }

      // Ensure reusable steps have deterministic ids BEFORE provenance binding
      ensureStepIds({
        executableId: target.id,
        steps: (target.steps ?? []) as any[]
      });

      const includeStack = [...rootIncludeStack, target.id];

      validateReusablePurity({
        reusableDoc: target,
        reusablePath: targetPath,
        debug,
        includeStack,
        warnings
      });

      const groupName =
        ref
          .split(/[\\/]/)
          .pop()
          ?.replace(/\.json$/i, "")
          ?.replace(/[-_]/g, " ")
          ?.replace(/\b\w/g, (c) => c.toUpperCase())
        ?? ref;

      for (let index = 0; index < target.steps.length; index++) {
        const s = target.steps[index];

        // Absolute guarantee: id must exist
        if (!s.id || typeof s.id !== "string") {
          s.id = `${target.id}::${index}`;
        }

        const sid = s.id;

        (s as any).group = { name: groupName };

        expandedSteps.push(s);

        provenanceByStepId[sid] = {
          originExecutableId: target.id,
          originPath: targetPath,
          reusable: true,
          includeStack
        };
      }
    } else {
      // Root-level step

      if (!step.id || typeof step.id !== "string") {
        // Deterministic fallback (should not happen after ensureStepIds, but defensive)
        const idx = root.steps.indexOf(step);
        step.id = `${root.id}::${idx}`;
      }

      const sid = step.id;

      expandedSteps.push(step);

      provenanceByStepId[sid] = {
        originExecutableId: root.id,
        originPath: rootPath,
        reusable: false,
        includeStack: rootIncludeStack
      };
    }
  }

  return {
    ...root, // Ensures capability, promise, and description survive flattening
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
  * Function to compute signal strength (for potential future use in reporting or policy decisions)
  * based on execution engine and run summary. 
  * The formula differs for "playwright" and "testergizer" engines, reflecting their different result semantics.
  * ============================================================ */
function computeSignalStrength(
  engine: ExecutionEngine,
  summary: RunSummary
): number {
  if (engine === "playwright") {
    const P = summary.passed;
    const F = summary.failed;
    const A = summary.aborted;

    const E = P + F + A;
    if (E === 0) return 0;

    const raw = ((P - (F + A)) / E) * 100;
    return Math.round(raw * 100) / 100; // 2 decimal precision
  }

  // testergizer engine
  const V = summary.valid;
  const I = summary.invalid;
  const E = V + I;

  if (E === 0) return 0;

  const raw = ((V - I) / E) * 100;
  return Math.round(raw * 100) / 100;
}

/* ============================================================
 * COMPILE PHASE: Unroll base test definitions into a flat array of Testlets
 * ============================================================ */

function compileToTestlets(params: {
  suiteContext: Record<string, any>;
  testContext?: Record<string, any>;
  doc: ExecutableDoc;
  filePath: string;
  registry: Map<string, ExecutableDoc>;
  registryPaths: Map<string, string>;
  options: RunSuiteOptions;
}): {
  testlets: UnrolledTestlet[];
  expanded: ExecutableDoc;
  effectiveContext: Record<string, any>;
  provenanceByStepId: Record<string, StepProvenance>;
  debugWarnings: DebugWarning[];
} {
  const { suiteContext, doc, filePath, registry, registryPaths, options } = params;

  // SPRINT 7 BYPASS: Capture raw matrix properties before legacy validation strips them
  const rawVariance = (doc as any).variance;
  const rawTestMatrix = (doc as any).testMatrix ?? (doc as any).testDomain;
  const rawTestDomain = (doc as any).testDomain;
  const rawActions = (doc as any).actions;

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

  // SPRINT 7 BYPASS: Reinject the properties into the expanded document
  if (rawVariance) (expanded as any).variance = rawVariance;
  if (rawTestMatrix) (expanded as any).testMatrix = rawTestMatrix;
  if (rawTestDomain) (expanded as any).testDomain = rawTestDomain;
  if (rawActions) (expanded as any).actions = rawActions;

  const resolver = new DataMatrixResolver();
  const baseTestDef: any = {
    ...expanded,
    actions: expanded.steps
  };

  // SPRINT 7 FIX: Resolve variance file path absolutely against the test definition file
  if (baseTestDef.variance && baseTestDef.variance.filePath) {
    if (!path.isAbsolute(baseTestDef.variance.filePath)) {
      baseTestDef.variance.filePath = path.resolve(path.dirname(filePath), baseTestDef.variance.filePath);
    }
  }

  const testlets = resolver.resolve(baseTestDef);

  return { testlets, expanded, effectiveContext, provenanceByStepId, debugWarnings };
}

/* ============================================================
 * EXECUTION PHASE: Execute a single unrolled boundary contract
 * ============================================================ */

async function executeTestlet(params: {
  suiteId: string;
  runId: string;
  runDateFolder: string;
  suiteBaseUrl?: string;
  options: RunSuiteOptions;
  artifactsBaseDir: string;
  runOutDir: string;
  ctrDefinition?: any;
  testlet: UnrolledTestlet;
  expanded: ExecutableDoc;
  effectiveContext: Record<string, any>;
  filePath: string;
  provenanceByStepId: Record<string, StepProvenance>;
  debugWarnings: DebugWarning[];
}): Promise<{
  kind: "executed";
  testResult: TestResult;
  provenanceByStepId: Record<string, StepProvenance>;
  debugWarnings: DebugWarning[];
}> {
  const {
    suiteId, runId, suiteBaseUrl, options, runOutDir, ctrDefinition,
    testlet, expanded, effectiveContext, filePath, provenanceByStepId, debugWarnings
  } = params;

  const artifactObserver = createArtifactObserver({
    runOutDir,
    suiteId,
    runId
  });

  // Isolated, cold context for this specific variation
  const coldContext = {
    ...effectiveContext,
    ...testlet.inputs
  };

  // Contract: In debug semantics (including stub), we do not hard-fail on missing interpolation.
  // This preserves exploratory workflows while keeping production runs strict.
  if (options.debug !== true) {
    throwIfIssues(
      validateInterpolationCompleteness({
        doc: { ...expanded, steps: testlet.actions } as any,
        contextKeys: new Set(Object.keys(coldContext)),
        filePath
      })
    );
  }

  // SPRINT 7 COMPILER PATCH: Map declarative matrix expectations to actionable execution steps
  const expectationSteps = (testlet.expect || []).map((exp: any, idx: number) => {
    let action = "assert";
    
    // Auto-route to the correct executor boundary logic based on the payload semantics
    if (exp.target === "url" || exp.target === "uri") {
      action = "assertUrl";
    } else if (exp.matcher && String(exp.matcher).toLowerCase().includes("text")) {
      action = "assertText";
    } else if (exp.matcher && String(exp.matcher).toLowerCase().includes("visible")) {
      action = "assertVisible";
    }

    return {
      id: `matrix-expect-${idx + 1}`,
      action,
      target: exp.target,
      value: exp.value,
      matcher: exp.matcher,
      group: { name: "Boundary Assertions" }
    };
  });

  // Append the compiled expectation steps to the end of the action array
  const combinedActions = [...testlet.actions, ...expectationSteps];

  const sandbox = options.executionEngine === "testergizer";
  const resolvedContext = resolveRootContext({
    context: coldContext,
    sandbox,
    injectedSecrets: parseInjectedSecrets([])
  });

  // Interpolate the entire combined sequence, ensuring matrix variables apply to expectations
  const interpolatedActions = interpolateDeepStrict(combinedActions, resolvedContext.values);

  const executionUnit = {
    ...testlet,
    id: testlet.instanceId, 
    testDomain: (expanded as any).testDomain ?? "ui", 
    steps: interpolatedActions 
  };

  const runner = new TestExecutor({
    executionEngine: options.executionEngine ?? "testergizer",
    headless: options.headless,
    slowMoMs: options.slowMoMs,
    baseUrl: options.baseUrl ?? suiteBaseUrl,
    browserName: options.browserName,
    retries: Math.max(0, Number(options.retries ?? 0)),
    artifacts: {
      enabled: (options.executionEngine ?? "testergizer") !== "testergizer",
      dir: runOutDir,
      trace: "on-failure",
      video: "on-failure",
      screenshot: "on-failure"
    },
    artifactObserver,
    autVersion: options.autVersion,
    ctrDefinition
  });

  const testResult = await runner.execute(executionUnit as any);

  const outDir = path.join(
    runOutDir,
    testResult.projectId,
    testResult.id
  );

  new JsonReporter({ outputDir: outDir }).write("result.json", testResult);

  return { kind: "executed", testResult, provenanceByStepId, debugWarnings };
}

type IndexedResult =
  | { kind: "skipped"; testId: string; testPath: string; reason?: string }
  | { kind: "invalid"; testId: string; testPath: string; phase: "compile"; reason: string; stack?: string }
  | { kind: "executed"; testResult: TestResult; provenanceByStepId: Record<string, any>; debugWarnings: any[] };

/* ============================================================
 * Public entrypoint
 * ============================================================ */
export async function executeSuiteFromFile(inputPath: string, options: RunSuiteOptions = {}) {
  if (options.workers !== undefined) {
    console.log(`[suite] workers requested: ${options.workers}`);
  }else {
    console.log(`[suite] no workers option provided, defaulting to sequential execution`);
  }
  const rootPath = path.resolve(inputPath);
  const root = loadJson(rootPath);

  const artifactsBaseDir = options.artifactsDir ?? "artifacts";
  const ci = isCiEnvironment();

  /* ============================================================
   * Suite dispatcher (schema switch)
   * ============================================================ */

  if (!isObject(root) || typeof (root as any).schemaVersion !== "string") {
    throw new Error("Single executable runs must be wrapped in a suite");
  }

  switch ((root as any).schemaVersion) {
    /* ============================================================
     * SUITE v2  (PRIMARY)
     * ============================================================ */
    case "v2": {
      if (!isSuiteDocV2(root)) {
        throw new Error("Invalid Suite v2 document structure");
      }

      const suite = root as SuiteDocV2;
      const resolvedAutVersion = options.autVersion ?? suite.autVersion;
      const suiteDebugOnly = suite.debugOnly === true;

      const engine = options.executionEngine ?? "testergizer";
      const { effectiveDebug, debugForced } = computeEffectiveDebug({
        executionEngine: engine,
        suiteDebugOnly,
        userDebugFlag: options.debug === true,
        ci,
        suiteId: suite.suiteId
      });

      const validationMode: "debug" | "strict" = effectiveDebug ? "debug" : "strict";

      const executionIntent: ExecutionIntent =
        engine === "testergizer" ? "review" : options.executionIntent ?? "verify";

      const suiteRetries = typeof suite.retries === "number" ? Math.max(0, suite.retries) : undefined;
      const cliRetries = typeof options.retries === "number" ? Math.max(0, options.retries) : undefined;
      const effectiveRetries = cliRetries !== undefined ? cliRetries : suiteRetries !== undefined ? suiteRetries : 0;

      const effectiveOptions: RunSuiteOptions = {
        ...options,
        executionEngine: engine,
        debug: effectiveDebug,
        retries: effectiveRetries,
        autVersion: resolvedAutVersion
      };

      const suiteDir = path.dirname(rootPath);
      const resolveBase = suite.resolveFrom ? path.resolve(suiteDir, suite.resolveFrom) : suiteDir;

      let ctrDefinition: any | undefined;
      if ((suite as any).ctr?.path) {
        const ctrPath = path.resolve(resolveBase, (suite as any).ctr.path);
        if (fs.existsSync(ctrPath)) {
          ctrDefinition = loadJson(ctrPath);
        } else {
          throw new Error(`CTR file not found: ${ctrPath}`);
        }
      }

      let versionCheck: any = { status: "unmanaged" };
      if (ctrDefinition && ctrDefinition.appId && ctrDefinition.versionRange) {
        versionCheck = evaluateVersionCompatibility(ctrDefinition, {
          executionEngine: engine,
          executionIntent,
          validationMode,
          detectedAutVersion: resolvedAutVersion ?? "demo",
          detectedDomFingerprint: undefined
        });
      }

      const ctrResolution = ctrDefinition
        ? {
            appId: ctrDefinition.appId,
            versionRange: ctrDefinition.versionRange,
            detectedAutVersion: resolvedAutVersion ?? null,
            versionCheck
          }
        : undefined;

      const startedAt = nowIso();
      const runId = randomUUID();
      const runDateFolder = toDateFolder(startedAt);

      const runOutDir = path.join(artifactsBaseDir, suite.suiteId, runDateFolder, runId);
      ensureArtifactsIndex({ runOutDir, suiteId: suite.suiteId, runId });

      const tests: TestResult[] = [];
      const provenanceByTestId: Record<string, Record<string, StepProvenance>> = {};
      const debugWarningsAll: DebugWarning[] = [];

      const invalidTests: InvalidTestEntry[] = [];
      const skippedTests: SkippedTestEntry[] = [];

      const flowsDir = path.resolve(process.cwd(), "flows");
      const flows = loadAllExecutablesWithPaths(flowsDir);

      function commitIndexedResult(r: IndexedResult) {
        if (r.kind === "skipped") {
          skippedTests.push({ testId: r.testId, testPath: r.testPath, reason: r.reason });
          return;
        }
        if (r.kind === "invalid") {
          invalidTests.push({ testId: r.testId, testPath: r.testPath, phase: r.phase, reason: r.reason, stack: r.stack });
          provenanceByTestId[r.testId] = {};
          return;
        }
        tests.push(r.testResult);
        provenanceByTestId[r.testResult.id] = r.provenanceByStepId;
        debugWarningsAll.push(...r.debugWarnings);
      }

      // SPRINT 7: Compile Phase
      // We unroll all variations first to feed them to the Orchestrator
      const tasks: ScheduledTask<IndexedResult>[] = [];
      let globalTaskIndex = 0;

      for (let i = 0; i < suite.tests.length; i++) {
        let normalized;
        try {
          normalized = normalizeSuiteV2TestEntry({ entry: suite.tests[i], resolveBase });

          if (normalized.skip) {
            commitIndexedResult({ kind: "skipped", testId: normalized.testId, testPath: normalized.filePath, reason: normalized.skip.reason });
            continue;
          }

          if (!normalized.doc) {
            throw new Error(`Suite v2 entry normalized without doc and without skip at index ${i}`);
          }

          const effectiveDoc: ExecutableDoc = { ...normalized.doc, id: normalized.testId };

          const compiled = compileToTestlets({
            suiteContext: suite.context ?? {},
            testContext: normalized.testParams ?? {},
            doc: effectiveDoc,
            filePath: normalized.filePath,
            registry: flows.docs,
            registryPaths: flows.paths,
            options: effectiveOptions
          });

          // Harvest compilation warnings ONCE to prevent 8x duplication across unrolled workers
          debugWarningsAll.push(...compiled.debugWarnings);

          for (const testlet of compiled.testlets) {
            const taskIndex = globalTaskIndex++;
            tasks.push({
              index: taskIndex,
              taskId: `suite-test-${i}-var-${testlet.instanceId}`,
              execute: async (workerId: number = 0) => {
                return await executeTestlet({
                  suiteId: suite.suiteId,
                  runId,
                  runDateFolder,
                  suiteBaseUrl: suite.baseUrl,
                  options: effectiveOptions,
                  artifactsBaseDir,
                  runOutDir,
                  ctrDefinition,
                  testlet,
                  expanded: compiled.expanded,
                  effectiveContext: compiled.effectiveContext,
                  filePath: normalized!.filePath,
                  provenanceByStepId: compiled.provenanceByStepId,
                  debugWarnings: [] // Warnings already harvested
                });
              }
            });
          }

        } catch (err: any) {
          const fallbackId = normalized?.testId ?? `invalid-test-${i + 1}`;
          const fallbackPath = normalized?.filePath ?? `${rootPath}#tests[${i}]`;
          commitIndexedResult({
            kind: "invalid",
            testId: fallbackId,
            testPath: fallbackPath,
            phase: "compile",
            reason: `Validation/prepare failed: ${errorMessage(err)}`,
            stack: errorStack(err)
          });
        }
      }

      // SPRINT 7: Execution Phase
      const workers = options.workers ?? 1;

      if (workers <= 1) {
        for (const t of tasks) {
          const res = await t.execute(0);
          commitIndexedResult(res);
        }
      } else {
        const orchestrator = new Orchestrator({
          parallelism: workers,
          cpuCoresDetected: os.cpus().length
        });
        const orchestrationResult = await orchestrator.run(tasks);
        for (const item of orchestrationResult.items) {
          commitIndexedResult(item);
        }
      }

      const endedAt = nowIso();

      const reviewed = tests.filter((t) => t.result === "reviewed").length;
      const passed = tests.filter((t) => t.result === "passed").length;
      const failed = tests.filter((t) => t.result === "failed").length;
      const aborted = tests.filter((t) => t.result === "aborted").length;

      const valid = passed + reviewed;
      const invalid = failed + aborted;

      const summary = { total: tests.length, passed, failed, aborted, reviewed, valid, invalid };

      let suiteStatus: "valid" | "invalid" | "passed" | "failed";
      if (engine === "testergizer") {
        suiteStatus = invalid > 0 ? "invalid" : "valid";
      } else {
        suiteStatus = invalid > 0 ? "failed" : "passed";
      }

      const signalStrength = computeSignalStrength(engine, summary);

      const fallbackProject = engine === "api" ? "rest-api" : "chromium";
      const projectId = tests.length === 0
          ? effectiveOptions.browserName ?? fallbackProject
          : tests.every((t) => t.projectId === tests[0].projectId)
          ? tests[0].projectId
          : "mixed";

      const resolvedBaseUrl = options.baseUrl ?? (suite as any).baseUrl ?? undefined;
      const applicationName = (root as any).applicationName ?? suite.suiteName ?? suite.suiteId;

      const runResult: RunResult = {
        schemaVersion: "v1",
        suiteId: suite.suiteId,
        suiteName: suite.suiteName,
        suitePath: rootPath,
        applicationName,
        runId,
        executionEngine: engine,
        validationMode,
        executionIntent,
        projectId,
        baseUrl: resolvedBaseUrl,
        startedAt,
        endedAt,
        durationMs: durationMs(startedAt, endedAt),
        tests,
        summary,
        suiteStatus,
        signalStrength
      };

      if (ctrDefinition) (runResult as any).ctrDefinition = ctrDefinition;
      if (ctrResolution) (runResult as any).ctrResolution = ctrResolution;

      (runResult as any).debugOnly = suiteDebugOnly || engine === "testergizer";
      (runResult as any).debugForced = debugForced;
      (runResult as any).ci = ci === true;

      // EXPLICIT WORKER LOGGING PATCH
      (runResult as any).workers = workers;

      if (effectiveOptions.launch?.command) {
        (runResult as any).launch = { command: effectiveOptions.launch.command, cwd: effectiveOptions.launch.cwd };
      }

      (runResult as any).invalidation = { count: invalidTests.length, tests: invalidTests };
      (runResult as any).skipped = { count: skippedTests.length, tests: skippedTests };

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
          console.warn(`⚠️  [${w.originExecutableId}] ${w.field} (step: ${w.stepId}) — ${w.message} — ${w.originPath} — stack: ${w.includeStack.join(" → ")}`);
        }
        console.warn("");
      }

      const artifactsDoc = loadJson(path.join(runOutDir, "artifacts.json"));
      new HtmlReporter({ outputDir: runOutDir }).write(runResult, artifactsDoc);

      const reportPath = path.resolve(runOutDir, "report.html");
      console.log("\nTestergizer HTML report:");
      console.log(pathToFileURL(reportPath).href);
      console.log("Tip: paste the URL into your browser to view the report\n");

      return runResult;
    }

    /* ============================================================
     * SUITE v1  (FALLBACK / BACKWARD COMPATIBILITY)
     * ============================================================ */
    case "v1": {
      if (!isSuiteDoc(root)) {
        throw new Error("Invalid Suite v1 document structure");
      }

      const suite = root as SuiteDoc;
      const resolvedAutVersion = options.autVersion ?? suite.autVersion;
      const suiteDebugOnly = suite.debugOnly === true;

      const engine = options.executionEngine ?? "testergizer";
      const { effectiveDebug, debugForced } = computeEffectiveDebug({
        executionEngine: engine,
        suiteDebugOnly,
        userDebugFlag: options.debug === true,
        ci,
        suiteId: suite.suiteId
      });

      const validationMode: "debug" | "strict" = effectiveDebug ? "debug" : "strict";

      const executionIntent: ExecutionIntent =
        engine === "testergizer" ? "review" : options.executionIntent ?? "verify";

      const effectiveOptions: RunSuiteOptions = {
        ...options,
        executionEngine: engine,
        debug: effectiveDebug,
        autVersion: resolvedAutVersion
      };

      const suiteDir = path.dirname(rootPath);

      let ctrDefinition: any | undefined;
      if ((suite as any).ctr?.path) {
        const ctrPath = path.resolve(suiteDir, (suite as any).ctr.path);
        if (fs.existsSync(ctrPath)) {
          ctrDefinition = loadJson(ctrPath);
        } else {
          throw new Error(`CTR file not found: ${ctrPath}`);
        }
      }

      let versionCheck: any = { status: "unmanaged" };
      if (ctrDefinition && ctrDefinition.appId && ctrDefinition.versionRange) {
        versionCheck = evaluateVersionCompatibility(ctrDefinition, {
          executionEngine: engine,
          executionIntent,
          validationMode,
          detectedAutVersion: resolvedAutVersion ?? "demo",
          detectedDomFingerprint: undefined
        });
      }

      const ctrResolution = ctrDefinition
        ? {
            appId: ctrDefinition.appId,
            versionRange: ctrDefinition.versionRange,
            detectedAutVersion: resolvedAutVersion ?? null,
            versionCheck
          }
        : undefined;

      const startedAt = nowIso();
      const runId = randomUUID();
      const runDateFolder = toDateFolder(startedAt);

      const runOutDir = path.join(artifactsBaseDir, suite.suiteId, runDateFolder, runId);
      ensureArtifactsIndex({ runOutDir, suiteId: suite.suiteId, runId });

      const tests: TestResult[] = [];
      const provenanceByTestId: Record<string, Record<string, StepProvenance>> = {};
      const debugWarningsAll: DebugWarning[] = [];

      const invalidTests: InvalidTestEntry[] = [];
      const skippedTests: SkippedTestEntry[] = [];

      const flowsDir = path.resolve(process.cwd(), "flows");
      const flows = loadAllExecutablesWithPaths(flowsDir);

      function commitIndexedResult(r: IndexedResult) {
        if (r.kind === "skipped") {
          skippedTests.push({ testId: r.testId, testPath: r.testPath, reason: r.reason });
          return;
        }
        if (r.kind === "invalid") {
          invalidTests.push({ testId: r.testId, testPath: r.testPath, phase: r.phase, reason: r.reason, stack: r.stack });
          provenanceByTestId[r.testId] = {};
          return;
        }
        tests.push(r.testResult);
        provenanceByTestId[r.testResult.id] = r.provenanceByStepId;
        debugWarningsAll.push(...r.debugWarnings);
      }

      const tasks: ScheduledTask<IndexedResult>[] = [];
      let globalTaskIndex = 0;

      for (let i = 0; i < suite.tests.length; i++) {
        let normalized;
        try {
          normalized = normalizeSuiteTestEntry({ entry: suite.tests[i], suiteDir, suiteFilePath: rootPath, index: i });

          if (normalized.skip) {
            const sid = normalized.filePath ? path.basename(normalized.filePath) : `skipped-test-${i + 1}`;
            commitIndexedResult({ kind: "skipped", testId: sid, testPath: normalized.filePath, reason: normalized.skip.reason });
            continue;
          }

          if (!normalized.doc) {
            throw new Error(`Suite v1 entry normalized without doc and without skip at index ${i}`);
          }

          const compiled = compileToTestlets({
            suiteContext: suite.context ?? {},
            doc: normalized.doc,
            filePath: normalized.filePath,
            registry: flows.docs,
            registryPaths: flows.paths,
            options: effectiveOptions
          });

          debugWarningsAll.push(...compiled.debugWarnings);

          for (const testlet of compiled.testlets) {
            const taskIndex = globalTaskIndex++;
            tasks.push({
              index: taskIndex,
              taskId: `suite-test-${i}-var-${testlet.instanceId}`,
              execute: async (workerId: number = 0) => {
                return await executeTestlet({
                  suiteId: suite.suiteId,
                  runId,
                  runDateFolder,
                  suiteBaseUrl: suite.baseUrl,
                  options: effectiveOptions,
                  artifactsBaseDir,
                  runOutDir,
                  ctrDefinition,
                  testlet,
                  expanded: compiled.expanded,
                  effectiveContext: compiled.effectiveContext,
                  filePath: normalized!.filePath,
                  provenanceByStepId: compiled.provenanceByStepId,
                  debugWarnings: []
                });
              }
            });
          }

        } catch (err: any) {
          const fallbackPath = normalized?.filePath ?? `${rootPath}#tests[${i}]`;
          const fallbackId = (normalized?.doc && typeof normalized.doc.id === "string" && normalized.doc.id) || `invalid-test-${i + 1}`;
          commitIndexedResult({
            kind: "invalid",
            testId: fallbackId,
            testPath: fallbackPath,
            phase: "compile",
            reason: `Validation/prepare failed: ${errorMessage(err)}`,
            stack: errorStack(err)
          });
        }
      }

      const workers = options.workers ?? 1;

      if (workers <= 1) {
        for (const t of tasks) {
          const res = await t.execute(0);
          commitIndexedResult(res);
        }
      } else {
        const orchestrator = new Orchestrator({
          parallelism: workers,
          cpuCoresDetected: os.cpus().length
        });
        const orchestrationResult = await orchestrator.run(tasks);
        for (const item of orchestrationResult.items) {
          commitIndexedResult(item);
        }
      }

      const endedAt = nowIso();

      const reviewed = tests.filter((t) => t.result === "reviewed").length;
      const passed = tests.filter((t) => t.result === "passed").length;
      const failed = tests.filter((t) => t.result === "failed").length;
      const aborted = tests.filter((t) => t.result === "aborted").length;

      const valid = passed + reviewed;
      const invalid = failed + aborted;

      const summary = { total: tests.length, passed, failed, aborted, reviewed, valid, invalid };

      let suiteStatus: "valid" | "invalid" | "passed" | "failed";
      if (engine === "testergizer") {
        suiteStatus = invalid > 0 ? "invalid" : "valid";
      } else {
        suiteStatus = invalid > 0 ? "failed" : "passed";
      }

      const signalStrength = computeSignalStrength(engine, summary);

      const fallbackProject = engine === "api" ? "rest-api" : "chromium";
      const projectId = tests.length === 0
          ? effectiveOptions.browserName ?? fallbackProject
          : tests.every((t) => t.projectId === tests[0].projectId)
          ? tests[0].projectId
          : "mixed";

      const resolvedBaseUrl = options.baseUrl ?? (suite as any).baseUrl ?? undefined;

      const runResult: RunResult = {
        schemaVersion: "v1",
        suiteId: suite.suiteId,
        suiteName: suite.suiteName,
        suitePath: rootPath,
        applicationName: suite.applicationName ?? suite.suiteName ?? suite.suiteId,
        runId,
        executionEngine: engine,
        validationMode,
        executionIntent,
        projectId,
        baseUrl: resolvedBaseUrl,
        startedAt,
        endedAt,
        durationMs: durationMs(startedAt, endedAt),
        tests,
        summary,
        suiteStatus,
        signalStrength
      };

      if (ctrDefinition) (runResult as any).ctrDefinition = ctrDefinition;
      if (ctrResolution) (runResult as any).ctrResolution = ctrResolution;

      (runResult as any).debugOnly = suiteDebugOnly || engine === "testergizer";
      (runResult as any).debugForced = debugForced;
      (runResult as any).ci = ci === true;

      // EXPLICIT WORKER LOGGING PATCH
      (runResult as any).workers = workers;

      if (effectiveOptions.launch?.command) {
        (runResult as any).launch = { command: effectiveOptions.launch.command, cwd: effectiveOptions.launch.cwd };
      }

      (runResult as any).invalidation = { count: invalidTests.length, tests: invalidTests };
      (runResult as any).skipped = { count: skippedTests.length, tests: skippedTests };

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
          console.warn(`⚠️  [${w.originExecutableId}] ${w.field} (step: ${w.stepId}) — ${w.message} — ${w.originPath} — stack: ${w.includeStack.join(" → ")}`);
        }
        console.warn("");
      }

      const artifactsDoc = loadJson(path.join(runOutDir, "artifacts.json"));
      new HtmlReporter({ outputDir: runOutDir }).write(runResult, artifactsDoc);

      const reportPath = path.resolve(runOutDir, "report.html");
      console.log("\nTestergizer HTML report:");
      console.log(pathToFileURL(reportPath).href);
      console.log("Tip: paste the URL into your browser to view the report\n");

      return runResult;
    }

    default:
      throw new Error(`Unsupported suite schemaVersion "${(root as any).schemaVersion}".`);
  }
}