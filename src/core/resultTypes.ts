import { ExecutionEngine, ExecutionIntent, ValidationMode, TestDomain } from "./types";

/**
 * Evidence semantics (Open Core)
 *
 * Playwright-aligned terminology:
 * - Test-level field name: result
 * - Allowed values: passed | failed | aborted
 *
 * Notes:
 * - Steps keep a simple passed/failed status.
 * - aborted is reserved for infra/runtime interruption where the test did not
 *   reach a meaningful conclusion.
 *
 * Core principle:
 * - This file defines facts only.
 * - No comparison, inference, or divergence labeling.
 */

export type StepStatus = "passed" | "failed" | "reviewed";
export type TestResultValue = "passed" | "failed" | "aborted" | "reviewed";

/* ============================================================
 * Errors & steps
 * ============================================================ */

export interface StepError {
  reason: string;
  message: string;
  stack?: string;
}

/**
 * CLR-aware target metadata (optional, backwards compatible).
 *
 * - logical: CLR key (semantic intent) e.g. "login.username.edit"
 * - value: resolved selector value used at runtime e.g. "#user-name"
 * - resolvedBy / attempts: resolution diagnostics for report foldout
 */
export interface StepTargetResolvedBy {
  using: string;
  value: string;
}

export interface StepTargetAttempt {
  using: string;
  value: string;
  result: "success" | "not_found";
}

export interface StepResult {
  id: string;
  action: string;
  // 🔽 passthrough metadata (compiler → runner → reporter)
  group?: {
    name: string;
  };

  /**
   * Target metadata.
   *
   * Backwards compatible:
   * - Existing runs may only include { value, resolved? }.
   * CLR-enhanced:
   * - logical + resolvedBy + attempts enable report rendering as:
   *   logical key (primary) + expandable resolution section.
   */
  target?: {
    /**
     * CLR logical key (semantic)
     * e.g. login.username.edit
     */
    logical?: string;

    /**
     * Final selector used at runtime
     */
    value: string;

    /**
     * Whether resolution succeeded
     */
    resolved?: boolean;

    /**
     * The selector that resolved successfully
     */
    resolvedBy?: {
      using: string;
      value: string;
    };

    /**
     * All resolution attempts
     */
    attempts?: {
      using: string;
      value: string;
      result: "success" | "not_found";
    }[];
  };

  data?: {
    value: any;
    masked?: boolean;
  };
  status: StepStatus;
  attempts: number;
  errors: StepError[];
  startedAt: string;
  endedAt: string;
  durationMs: number;
}

export interface StepWarning {
  code: string;
  message: string;
}

/* ============================================================
 * Instrumentation & cache (facts only)
 * ============================================================ */

export interface InstrumentationState {
  video?: {
    enabled: boolean;
  };
  snapshot?: {
    enabled: boolean;
  };
  domSnapshot?: {
    enabled: boolean;
  };
}

export interface CacheState {
  mode: "enabled" | "disabled" | "unknown";
  state: "warm" | "cold" | "unknown";
  scope: "browser" | "app" | "system" | "mixed" | "unknown";
}

/* ============================================================
 * Attempt-level execution
 * ============================================================ */

export interface TestAttemptResult {
  attempt: number;

  /** Playwright-aligned outcome */
  result: TestResultValue;

  startedAt: string;
  endedAt: string;
  durationMs: number;

  instrumentation?: InstrumentationState;

  /** Populated mainly for failed / aborted attempts */
  errors?: StepError[];

  steps: StepResult[];
  cache?: CacheState;
}

/* ============================================================
 * Test-level result (may include retries)
 * ============================================================ */

export interface TestResult {
  id: string;
  name?: string;
  testDomain: TestDomain;

  /** Playwright project id (for now: browserName) */
  projectId: string;

  /**
   * Final outcome after all attempts.
   * Aligned with Playwright semantics.
   */
  result: TestResultValue;

  startedAt: string;
  endedAt: string;
  durationMs: number;

  /**
   * Attempts are explicit and ordered.
   * Attempt 1 is the initial execution.
   */
  attempts: TestAttemptResult[];
}

/* ============================================================
 * Run-level result
 * ============================================================ */

export interface RunSummary {
  total: number;

  passed: number;
  failed: number;
  aborted: number;

  reviewed: number;

  valid: number;
  invalid: number;
}

export interface RunResult {
  schemaVersion: "v1";

  suiteId: string;
  suiteName?: string;
  suitePath: string;

  applicationName: string; // ✅ AUT — canonical source
  // ✅ ADD
  baseUrl?: string;

  /** Opaque run identity (not time-derived) */
  runId: string;

  executionEngine: ExecutionEngine;
  executionIntent: ExecutionIntent;
  validationMode: ValidationMode;

  /** Playwright project id (for now: browserName or mixed) */
  projectId: string;

  startedAt: string;
  endedAt: string;
  durationMs: number;

  /** Run-level cache context (baseline facts) */
  cache?: CacheState;

  tests: TestResult[];
  summary: RunSummary;
  suiteStatus: "valid" | "invalid" | "passed" | "failed";
  signalStrength: number; // -100 to +100 normalized polarity metric
}