import { ExecutionMode, TestDomain } from "./types";

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

export type StepStatus = "passed" | "failed";
export type TestResultValue = "passed" | "failed" | "aborted";

/* ============================================================
 * Errors & steps
 * ============================================================ */

export interface StepError {
  reason: string;
  message: string;
  stack?: string;
}

export interface StepResult {
  id: string;
  action: string;
  status: StepStatus;
  attempts: number;
  errors: StepError[];
  startedAt: string;
  endedAt: string;
  durationMs: number;
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

  /** Execution mode for this test (headed / headless) */
  executionMode: ExecutionMode;

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
}

export interface RunResult {
  schemaVersion: "v1";

  suiteId: string;
  suiteName?: string;
  suitePath: string;

  applicationName: string; // ✅ AUT — canonical source

  /** Opaque run identity (not time-derived) */
  runId: string;

  /** real | stub */
  executionType: "real" | "stub";

  executionMode: ExecutionMode;

  /** Playwright project id (for now: browserName or mixed) */
  projectId: string;

  startedAt: string;
  endedAt: string;
  durationMs: number;

  /** Run-level cache context (baseline facts) */
  cache?: CacheState;

  tests: TestResult[];
  summary: RunSummary;
}
