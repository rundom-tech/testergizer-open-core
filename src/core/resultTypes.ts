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
 */

export type StepStatus = "passed" | "failed";
export type TestResultValue = "passed" | "failed" | "aborted";

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

export interface TestResult {
  id: string;
  name?: string;
  testDomain: TestDomain;
  executionMode: ExecutionMode;

  /** Playwright-aligned outcome */
  result: TestResultValue;

  /** Playwright project id (for now: browserName) */
  projectId: string;

  startedAt: string;
  endedAt: string;
  durationMs: number;

  /** Populated mainly for aborted */
  errors?: StepError[];

  steps: StepResult[];
}

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

  runId: string; // ISO timestamp

  executionMode: ExecutionMode;

  /** Playwright project id (for now: browserName) */
  projectId: string;

  startedAt: string;
  endedAt: string;
  durationMs: number;

  tests: TestResult[];
  summary: RunSummary;
}
