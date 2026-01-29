import fs from "fs";
import path from "path";

import { CoreRunner } from "../core/CoreRunner";
import { JsonReporter } from "../tools/jsonReporter";

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

import type { JsonTestDefinition } from "../core/types";

/**
 * Public, frozen API.
 * Used by platform tests and programmatic callers.
 * DO NOT change this signature.
 */
export interface RunSuiteOptions {
  executionMode?: "stub" | "real";
  artifactsDir?: string;
}

/**
 * Internal executable document shape (JSON-based).
 */
interface ExecutableDoc {
  id: string;
  reusable?: boolean;
  context?: Record<string, any>;
  steps: any[];
}

/* ============================================================
 * Helpers
 * ============================================================ */

function loadJson(filePath: string): ExecutableDoc {
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

function loadAllExecutables(dir: string): Map<string, ExecutableDoc> {
  const map = new Map<string, ExecutableDoc>();

  if (!fs.existsSync(dir)) return map;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const e of entries) {
    const full = path.join(dir, e.name);

    if (e.isDirectory()) {
      for (const [k, v] of loadAllExecutables(full)) {
        map.set(k, v);
      }
    } else if (e.isFile() && e.name.endsWith(".json")) {
      const doc = loadJson(full);
      if (map.has(doc.id)) {
        throw new Error(`Duplicate executable id: ${doc.id}`);
      }
      map.set(doc.id, doc);
    }
  }

  return map;
}

function expandIncludes(
  root: ExecutableDoc,
  registry: Map<string, ExecutableDoc>
): ExecutableDoc {
  const expandedSteps: any[] = [];

  for (const step of root.steps) {
    if (step?.type === "include") {
      const ref = step.ref;
      const target = registry.get(ref);

      if (!target) {
        throw new Error(`Include reference not found: ${ref}`);
      }
      if (!target.reusable) {
        throw new Error(`Include target is not reusable: ${ref}`);
      }
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

/* ============================================================
 * Public entrypoint (signature preserved)
 * ============================================================ */

export async function runSuiteFromFile(
  suitePath: string,
  options: RunSuiteOptions = {}
) {
  const executionMode = options.executionMode ?? "real";
  const sandbox = executionMode === "stub";
  const outputDir = options.artifactsDir ?? "artifacts";

  const rootPath = path.resolve(suitePath);
  const root = loadJson(rootPath);

  // ── validation: root executable ───────────────────────────
  throwIfIssues(validateExecutableDoc(root, rootPath));

  if (root.reusable) {
    throw new Error(`Reusable executable cannot be run directly: ${root.id}`);
  }

  // ── load reusable flows ───────────────────────────────────
  const flowsDir = path.resolve("flows");
  const registry = loadAllExecutables(flowsDir);

  for (const doc of registry.values()) {
    throwIfIssues(validateExecutableDoc(doc));
    if (!doc.reusable) {
      throw new Error(`Non-reusable executable found in flows registry`);
    }
  }

  // ── validate includes ─────────────────────────────────────
  throwIfIssues(
    validateIncludesAgainstRegistry({
      doc: root,
      registry,
      filePath: rootPath
    })
  );

  // ── expand includes ───────────────────────────────────────
  const expanded = expandIncludes(root, registry);

  // ── validate interpolation completeness ───────────────────
  throwIfIssues(
    validateInterpolationCompleteness({
      doc: expanded,
      contextKeys: new Set(Object.keys(expanded.context ?? {})),
      filePath: rootPath
    })
  );

  // ── resolve context + secrets ─────────────────────────────
  const resolvedContext = resolveRootContext({
    context: expanded.context,
    sandbox,
    injectedSecrets: parseInjectedSecrets([])
  });

  // ── interpolate steps ─────────────────────────────────────
  const interpolatedSteps = interpolateDeepStrict(
    expanded.steps,
    resolvedContext.values
  );

  // ── build Core test definition ────────────────────────────
  const testDef: JsonTestDefinition = {
    id: expanded.id,
    steps: interpolatedSteps
  };

  // ── execute ───────────────────────────────────────────────
  const runner = new CoreRunner();
  const results = await runner.run(testDef);

  // ── report (masked) ───────────────────────────────────────
  const reporter = new JsonReporter({
    outputDir,
    secretVars: resolvedContext.secretVars
  });

  reporter.write("results.json", results);

  return results;
}
