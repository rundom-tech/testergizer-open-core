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
//
// - SPRINT 7 FINAL: Precompiled Divergent Topology (Base + Extension)
//   Orchestrator now fuses base foundation steps with variant-specific 
//   extension steps into a single, deterministic linear execution contract.
//
// - SPRINT 8: Unroll inline AweMG assertions during Compile Phase to maintain
//   atomic linear execution contracts for Playwright. Preserve semantic matrix
//   descriptions for HTML reporting. Refined aesthetic rendering of unrolled assertions.
//
// - SPRINT 8 PATCH: Implemented deep cloning via structuredClone in the compile 
//   loop to prevent destructive state mutation of shared base topologies 
//   during assertion extraction across multiple matrix variants.

import os from "os";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { pathToFileURL } from "url";

import { evaluateVersionCompatibility } from "../core/ctr/ctrVersionGuard";
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
import type { ExecutionEngine, ExecutionIntent, ValidationMode, UnrolledTestlet } from "../core/types";
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

  /** Proactive Obstacle Clearance (CCTR) Configuration */
  cctr?: {
    globalUrl?: string;
    localPath?: string;
  };

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
   * AUT version for CTR governance.
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
 * Runtime-only reporting channels (no schema changes).
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

type SuiteTestRef =
  | string
  | { ref: string }
  | { path: string }
  | { ref?: string; path?: string; skip?: SuiteSkipDecl };

type SuiteTestEntry = ExecutableDoc | SuiteTestRef;

interface SuiteDoc {
  schemaVersion: "v1";
  suiteId: string;
  applicationName?: string; // 🔒 AUT – reporting label only
  autVersion?: string;
  suiteName?: string;
  baseUrl?: string;

  debugOnly?: boolean;
  context?: Record<string, any>;
  tests: SuiteTestEntry[];
}

// Suite schema v2 (orchestration-only)
interface SuiteDocV2 {
  schemaVersion: "v2";
  suiteId: string;
  suiteName?: string;
  baseUrl?: string;
  resolveFrom?: string;
  autVersion?: string;
  debugOnly?: boolean;
  retries?: number;
  context?: Record<string, any>;
  tests: Array<{
    id: string;
    testRef: string;
    params?: Record<string, any>;
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
    Array.isArray(v.tests)
  );
}

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
  return (
    ref.includes("/") ||
    ref.includes("\\") ||
    ref.endsWith(".json") ||
    ref.startsWith(".")
  );
}

function isAbsoluteHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s);
}

function isCiEnvironment(): boolean {
  const v = process.env.CI;
  return typeof v === "string" && v.toLowerCase() === "true";
}

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

  if (executionEngine === "testergizer") {
    return { effectiveDebug: true, debugForced: false };
  }

  if (userDebugFlag) {
    return { effectiveDebug: true, debugForced: false };
  }

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

  ensureStepIds({ executableId: reusableDoc.id, steps: (reusableDoc.steps ?? []) as any[] });

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

  ensureStepIds({
    executableId: root.id,
    steps: (root.steps ?? []) as any[]
  });

  const expandedSteps: any[] = [];
  const rootIncludeStack = [root.id];

  // Recursive flattener to cleanly unwrap any inline groups, wrappers, or includes
  function flattenSteps(
    stepsToProcess: any[],
    currentStack: string[],
    sourcePath: string,
    sourceId: string,
    isReusableOrigin: boolean,
    inheritedGroup?: string
  ) {
    for (let index = 0; index < stepsToProcess.length; index++) {
      const step = stepsToProcess[index];

      if (isIncludeStep(step)) {
        const ref = step.ref;
        let target: ExecutableDoc | undefined;
        let targetPath: string | undefined;

        if (!isLikelyPathRef(ref)) {
          target = registry.get(ref);
          targetPath = registryPaths.get(ref);
        }

        if (!target) {
          if (sourcePath.includes("#")) {
            throw new Error(`Path-based include "${ref}" cannot be resolved from an inline suite executable. Move the executable into a real file.`);
          }
          const incAbs = path.resolve(path.dirname(sourcePath), ref);
          if (!fs.existsSync(incAbs)) {
            throw new Error(`Include reference not found: ${ref} (resolved: ${incAbs})`);
          }
          target = loadJson(incAbs) as ExecutableDoc;
          targetPath = incAbs;
        }

        if (!targetPath) targetPath = `registry:${ref}`;

        if (!target.reusable) {
          throw new Error(`Include target is not reusable: ${ref}`);
        }

        if (target.steps.some((s) => isIncludeStep(s))) {
          throw new Error(`Reusable "${target.id}" must not contain include steps`);
        }

        ensureStepIds({
          executableId: target.id,
          steps: (target.steps ?? []) as any[]
        });

        const newStack = [...currentStack, target.id];
        validateReusablePurity({
          reusableDoc: target,
          reusablePath: targetPath,
          debug,
          includeStack: newStack,
          warnings
        });

        const groupName = ref
          .split(/[\\/]/)
          .pop()
          ?.replace(/\.json$/i, "")
          ?.replace(/[-_]/g, " ")
          ?.replace(/\b\w/g, (c) => c.toUpperCase()) ?? ref;

        // QUALITY INTELLIGENCE FUSE: Deep clone reusable steps to prevent cross-variant mutation
        flattenSteps(structuredClone(target.steps), newStack, targetPath, target.id, true, groupName);

      } else if (step && typeof step === "object" && Array.isArray(step.steps)) {
        // INTERCEPT WRAPPER: Unpack nested inline blocks instead of passing to executor
        const groupName = step.group?.name || step.id || inheritedGroup || "Inline Group";
        
        // Generate IDs for the child steps before unpacking
        ensureStepIds({ executableId: step.id || sourceId, steps: step.steps });
        
        // Recurse into the wrapper's child steps
        flattenSteps(step.steps, currentStack, sourcePath, sourceId, isReusableOrigin, groupName);

      } else {
        // LEAF STEP: Dispatch to the linear execution pipeline
        if (!step.id || typeof step.id !== "string") {
          step.id = `${sourceId}::${index}`;
        }

        if (inheritedGroup) {
          (step as any).group = { name: inheritedGroup };
        }

        expandedSteps.push(step);

        provenanceByStepId[step.id] = {
          originExecutableId: sourceId,
          originPath: sourcePath,
          reusable: isReusableOrigin,
          includeStack: currentStack
        };

        // QUALITY INTELLIGENCE FUSE: Unroll AweMG Inline Assertions
        if (Array.isArray((step as any).assertions)) {
          (step as any).assertions.forEach((assertion: any, aIdx: number) => {
            let action = "assert";
            let displayTarget = assertion.target;
            let displayValue = assertion.value;
            let desc = `Verify ${assertion.target || 'value'}`;

            if (assertion.type === "EXPECT_URL" || assertion.type === "EXPECT_URI") {
              action = "assertUrl";
              // Satisfy BOTH the Reporter (aesthetics) and the Engine (execution contract)
              displayTarget = "page URL";
              displayValue = assertion.value;
              desc = `Verify URL resolves to ${assertion.value}`;
            } else if (assertion.type === "EXPECT_TEXT") {
              action = "assertText";
              desc = `Verify ${assertion.target} text matches "${assertion.value}"`;
            } else if (assertion.type === "EXPECT_VISIBLE") {
              action = "assertVisible";
              desc = `Verify ${assertion.target} is visible`;
            }

            const assertStepId = `${step.id}::assert-${aIdx}`;
            
            expandedSteps.push({
              id: assertStepId,
              action,
              target: displayTarget,
              value: displayValue,
              matcher: assertion.matcher,
              group: (step as any).group || (inheritedGroup ? { name: inheritedGroup } : undefined),
              description: desc
            });

            provenanceByStepId[assertStepId] = {
              originExecutableId: sourceId,
              originPath: sourcePath,
              reusable: isReusableOrigin,
              includeStack: currentStack
            };
          });

          // Remove the raw array from the original step so the reporter doesn't double-render
          delete (step as any).assertions;
        }
      }
    }
  }

  // Bootstrap the recursive unrolling
  flattenSteps(root.steps, rootIncludeStack, rootPath, root.id, false);

  return {
    ...root,
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

function normalizeSuiteTestEntry(params: {
  entry: SuiteTestEntry;
  suiteDir: string;
  suiteFilePath: string;
  index: number;
}): { doc?: ExecutableDoc; filePath: string; skip?: { reason?: string } } {
  const { entry, suiteDir, suiteFilePath, index } = params;

  if (isExecutableLike(entry)) {
    return { doc: entry, filePath: `${suiteFilePath}#tests[${index}]` };
  }

  if (typeof entry === "string") {
    const testPath = path.resolve(suiteDir, `${entry}.json`);
    return { doc: loadJson(testPath) as ExecutableDoc, filePath: testPath };
  }

  if (isObject(entry)) {
    const maybeSkip = parseSkipDecl((entry as any).skip);
    const hasSkip = maybeSkip.skip;

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
    return Math.round(raw * 100) / 100; 
  }

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

  const rawTestDomain = (doc as any).testDomain;

  throwIfIssues(validateExecutableDoc(doc, filePath));
  if (doc.reusable) throw new Error(`Reusable executable cannot be run directly: ${doc.id}`);

  const effectiveContext: Record<string, any> = {
    ...(suiteContext ?? {}),
    ...(params.testContext ?? {}),
    ...(doc.context ?? {})
  };

  const baseTestDef: any = {
    ...doc,
    actions: doc.steps
  };

  if (baseTestDef.variance && baseTestDef.variance.filePath) {
    if (!path.isAbsolute(baseTestDef.variance.filePath)) {
      baseTestDef.variance.filePath = path.resolve(path.dirname(filePath), baseTestDef.variance.filePath);
    }
  }

  // 1. Unroll the raw matrix first so we can access variant-specific steps
  const resolver = new DataMatrixResolver();
  const rawTestlets = resolver.resolve(baseTestDef);

  const finalTestlets: UnrolledTestlet[] = [];
  const globalProvenance: Record<string, StepProvenance> = {};
  const allWarnings: DebugWarning[] = [];

  for (const testlet of rawTestlets) {
    // QUALITY INTELLIGENCE FUSE: Deep clone to prevent destructive state mutation across matrix unrolling
    const baseSteps = structuredClone(doc.steps || []);
    const variantExtension = structuredClone(Array.isArray((testlet as any).steps) ? (testlet as any).steps : []);
    
    const combinedTopology = [...baseSteps, ...variantExtension];

    const testletContext = { ...effectiveContext, ...testlet.inputs };

    const expanded = expandIncludesWithProvenance({
      root: { ...doc, steps: combinedTopology, reusable: false, context: testletContext },
      rootPath: filePath,
      registry,
      registryPaths,
      debug: options.debug === true,
      warnings: allWarnings,
      provenanceByStepId: globalProvenance
    });

    finalTestlets.push({
      ...testlet,
      actions: expanded.steps,
      testDomain: rawTestDomain ?? "ui"
    });
  }

  // Deduplicate warnings to prevent N-worker spam for base steps
  const uniqueWarnings = Array.from(
    new Map(allWarnings.map(w => [`${w.stepId}-${w.field}`, w])).values()
  );

  return { 
    testlets: finalTestlets, 
    expanded: { ...doc, steps: [] }, // executeTestlet consumes testlet.actions directly now
    effectiveContext, 
    provenanceByStepId: globalProvenance, 
    debugWarnings: uniqueWarnings 
  };
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

  const coldContext = {
    ...effectiveContext,
    ...testlet.inputs
  };

  if (options.debug !== true) {
    throwIfIssues(
      validateInterpolationCompleteness({
        doc: { ...expanded, steps: testlet.actions } as any,
        contextKeys: new Set(Object.keys(coldContext)),
        filePath
      })
    );
  }

  const expectationSteps = (testlet.expect || []).map((exp: any, idx: number) => {
    let action = "assert";
    
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

  const combinedActions = [...testlet.actions, ...expectationSteps];

  const sandbox = options.executionEngine === "testergizer";
  const resolvedContext = resolveRootContext({
    context: coldContext,
    sandbox,
    injectedSecrets: parseInjectedSecrets([])
  });

  const interpolatedActions = interpolateDeepStrict(combinedActions, resolvedContext.values);

  const executionUnit = {
    ...testlet,
    id: testlet.instanceId, 
    // Preserve semantic routing names for the HTML Reporter
    name: (testlet as any).description || (expanded as any).name || (expanded as any).title || testlet.instanceId,
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
    cctr: options.cctr,
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
        autVersion: resolvedAutVersion,
        cctr: options.cctr ?? (suite as any).cctr
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
        autVersion: resolvedAutVersion,
        cctr: options.cctr ?? (suite as any).cctr
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