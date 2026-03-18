// src/cli/validate.ts
//
// Executable v1 validation (schema + hard rules).
// Complete file.
//
// Scope:
// - Validates a single executable JSON document against schemas/executable.schema.json
// - Enforces hard rules that JSON Schema alone cannot express cleanly
// - Optionally validates include refs against a provided registry
// - Optionally validates interpolation completeness against a provided context (typically after include expansion)
//
// Notes:
// - This module does NOT execute anything.
// - It is safe to run before loading Playwright / CoreRunner.

import fs from "fs";
import path from "path";
import Ajv, { ErrorObject, ValidateFunction } from "ajv";

export type ValidationIssue = {
  code: string;
  message: string;
  filePath?: string;
  scriptId?: string;
  stepIndex?: number;
  ref?: string;
  varName?: string;
};

export type ExecutableDoc = {
  id: string;
  reusable?: boolean;
  context?: Record<string, any>;
  steps: any[];
};

const VAR_NAME_RE = /^[A-Z][A-Z0-9_]*$/;
const SECRET_NAME_RE = /^[A-Z][A-Z0-9_]*$/;
const INTERP_RE = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;

let _ajv: Ajv | null = null;
let _validateExecutable: ValidateFunction<ExecutableDoc> | null = null;

function getAjv(): Ajv {
  if (_ajv) return _ajv;
  _ajv = new Ajv({
    allErrors: true,
    strict: false,
    allowUnionTypes: true
  });
  return _ajv;
}

function loadExecutableSchema(): any {
  const schemaPath = path.resolve(process.cwd(), "schemas", "executable.schema.json");
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Executable schema not found at: ${schemaPath}`);
  }
  const raw = fs.readFileSync(schemaPath, "utf-8");
  return JSON.parse(raw);
}

function getExecutableValidator(): ValidateFunction<ExecutableDoc> {
  if (_validateExecutable) return _validateExecutable;

  const ajv = getAjv();
  const schema = loadExecutableSchema();

  // Ensure schema is registered by $id (if provided)
  if (schema.$id && !ajv.getSchema(schema.$id)) {
    ajv.addSchema(schema, schema.$id);
  }

  _validateExecutable = ajv.compile<ExecutableDoc>(schema);
  return _validateExecutable;
}

function ajvErrorsToIssues(errors: ErrorObject[] | null | undefined, filePath?: string): ValidationIssue[] {
  if (!errors || errors.length === 0) return [];
  return errors.map((e) => ({
    code: "SCHEMA_INVALID",
    message: `${e.instancePath || "/"} ${e.message || "is invalid"}`,
    filePath
  }));
}

function isIncludeStep(step: any): boolean {
  return step && typeof step === "object" && step.type === "include" && typeof step.ref === "string";
}

function isSecretRef(v: any): v is { $secret: string } {
  return !!v && typeof v === "object" && typeof v.$secret === "string" && Object.keys(v).length === 1;
}

function walkStringsDeep(value: any, onString: (s: string) => void): void {
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    onString(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) walkStringsDeep(v, onString);
    return;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value)) walkStringsDeep(v, onString);
  }
}

function validateReusableHardRules(doc: ExecutableDoc, filePath?: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const reusable = !!doc.reusable;

  if (reusable) {
    // context must not exist (schema enforces, but keep as hard rule too)
    if (doc.context !== undefined) {
      issues.push({
        code: "REUSABLE_CONTEXT_FORBIDDEN",
        message: `Reusable executable must not define "context"`,
        filePath,
        scriptId: doc.id
      });
    }
    // include forbidden inside reusable (schema cannot enforce across steps array)
    for (let i = 0; i < (doc.steps?.length ?? 0); i++) {
      const step = doc.steps[i];
      if (isIncludeStep(step)) {
        issues.push({
          code: "REUSABLE_INCLUDE_FORBIDDEN",
          message: `Reusable executable must not contain include steps`,
          filePath,
          scriptId: doc.id,
          stepIndex: i,
          ref: step.ref
        });
      }
    }
  }

  return issues;
}

function validateContextHardRules(doc: ExecutableDoc, filePath?: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const reusable = !!doc.reusable;

  if (reusable) return issues; // reusable cannot have context anyway

  const ctx = doc.context ?? {};
  if (typeof ctx !== "object" || Array.isArray(ctx) || ctx === null) {
    issues.push({
      code: "CONTEXT_INVALID",
      message: `"context" must be an object map`,
      filePath,
      scriptId: doc.id
    });
    return issues;
  }

  for (const [k, v] of Object.entries(ctx)) {
    if (!VAR_NAME_RE.test(k)) {
      issues.push({
        code: "CONTEXT_VAR_NAME_INVALID",
        message: `Invalid context variable name: ${k}`,
        filePath,
        scriptId: doc.id,
        varName: k
      });
    }

    if (isSecretRef(v)) {
      if (!SECRET_NAME_RE.test(v.$secret)) {
        issues.push({
          code: "SECRET_NAME_INVALID",
          message: `Invalid $secret name for ${k}: ${v.$secret}`,
          filePath,
          scriptId: doc.id,
          varName: k
        });
      }
    }
  }

  return issues;
}

/**
 * Validate include refs against a provided registry.
 * This enforces: include must target an existing reusable.
 */
export function validateIncludesAgainstRegistry(args: {
  doc: ExecutableDoc;
  registry: Map<string, ExecutableDoc>;
  filePath?: string;
}): ValidationIssue[] {
  const { doc, registry, filePath } = args;
  const issues: ValidationIssue[] = [];

  // Only root scripts should contain includes; reusables are checked elsewhere.
  for (let i = 0; i < (doc.steps?.length ?? 0); i++) {
    const step = doc.steps[i];
    if (!isIncludeStep(step)) continue;

    const ref = step.ref;
    const target = registry.get(ref);
    if (!target) {
      issues.push({
        code: "INCLUDE_REF_NOT_FOUND",
        message: `Include ref not found: ${ref}`,
        filePath,
        scriptId: doc.id,
        stepIndex: i,
        ref
      });
      continue;
    }

    if (!target.reusable) {
      issues.push({
        code: "INCLUDE_TARGET_NOT_REUSABLE",
        message: `Include target must be reusable: ${ref}`,
        filePath,
        scriptId: doc.id,
        stepIndex: i,
        ref
      });
    }

    // Defensive: reusable must not include (again)
    if (target.steps?.some((s) => isIncludeStep(s))) {
      issues.push({
        code: "INCLUDE_TARGET_HAS_INCLUDE",
        message: `Reusable "${ref}" must not contain include steps`,
        filePath,
        scriptId: doc.id,
        stepIndex: i,
        ref
      });
    }
  }

  return issues;
}

/**
 * Validate interpolation completeness against a provided context key set.
 * Typically used AFTER include expansion (expanded doc has no includes).
 *
 * Missing {{VAR}} => hard error.
 */
export function validateInterpolationCompleteness(args: {
  doc: ExecutableDoc;
  contextKeys: Set<string>;
  filePath?: string;
}): ValidationIssue[] {
  const { doc, contextKeys, filePath } = args;
  const issues: ValidationIssue[] = [];

  const refs: Set<string> = new Set();

  // Scan all string fields in all steps
  for (let i = 0; i < (doc.steps?.length ?? 0); i++) {
    const step = doc.steps[i];
    walkStringsDeep(step, (s) => {
      let m: RegExpExecArray | null;
      INTERP_RE.lastIndex = 0;
      while ((m = INTERP_RE.exec(s)) !== null) {
        refs.add(m[1]);
      }
    });
  }

  for (const name of refs) {
    if (!VAR_NAME_RE.test(name)) {
      issues.push({
        code: "INTERP_VAR_NAME_INVALID",
        message: `Invalid interpolation variable name: ${name}`,
        filePath,
        scriptId: doc.id,
        varName: name
      });
      continue;
    }
    if (!contextKeys.has(name)) {
      issues.push({
        code: "INTERP_VAR_MISSING",
        message: `Missing context variable: ${name}`,
        filePath,
        scriptId: doc.id,
        varName: name
      });
    }
  }

  return issues;
}

/**
 * Validate a single executable doc (schema + hard rules).
 */
export function validateExecutableDoc(doc: ExecutableDoc, filePath?: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const validate = getExecutableValidator();
  const ok = validate(doc);
  if (!ok) {
    issues.push(...ajvErrorsToIssues(validate.errors, filePath));
    // Continue to hard rules anyway; better diagnostics
  }

  // Hard rules (beyond schema)
  issues.push(...validateReusableHardRules(doc, filePath));
  issues.push(...validateContextHardRules(doc, filePath));

  // Root include shape check (schema ensures ref exists for include, but keep explicit)
  for (let i = 0; i < (doc.steps?.length ?? 0); i++) {
    const step = doc.steps[i];
    if (step && typeof step === "object" && step.type === "include") {
      if (typeof step.ref !== "string" || step.ref.trim() === "") {
        issues.push({
          code: "INCLUDE_REF_INVALID",
          message: `Include step must have non-empty string "ref"`,
          filePath,
          scriptId: doc.id,
          stepIndex: i
        });
      }
    }
  }

  return issues;
}

/**
 * Load a JSON file and validate it as an executable doc.
 */
export function validateExecutableFile(filePath: string): { doc?: ExecutableDoc; issues: ValidationIssue[] } {
  const abs = path.resolve(filePath);
  let doc: ExecutableDoc;

  try {
    const raw = fs.readFileSync(abs, "utf-8");
    doc = JSON.parse(raw);
  } catch (e: any) {
    return {
      issues: [
        {
          code: "JSON_PARSE_ERROR",
          message: `Failed to parse JSON: ${e?.message ?? String(e)}`,
          filePath: abs
        }
      ]
    };
  }

  const issues = validateExecutableDoc(doc, abs);
  return { doc, issues };
}

/**
 * Throw if issues exist (useful in CLI).
 */
export function throwIfIssues(issues: ValidationIssue[]): void {
  if (!issues.length) return;

  const msg =
    `Validation failed with ${issues.length} issue(s):\n` +
    issues
      .map((i) => {
        const loc = [
          i.filePath ? `file=${i.filePath}` : null,
          i.scriptId ? `id=${i.scriptId}` : null,
          typeof i.stepIndex === "number" ? `step=${i.stepIndex}` : null,
          i.ref ? `ref=${i.ref}` : null,
          i.varName ? `var=${i.varName}` : null
        ]
          .filter(Boolean)
          .join(" ");
        return `- [${i.code}] ${i.message}${loc ? ` (${loc})` : ""}`;
      })
      .join("\n");

  throw new Error(msg);
}
