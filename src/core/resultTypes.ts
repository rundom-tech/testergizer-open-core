import { ExecutionMode } from "./types";

export type TestStatus = "passed" | "failed" | "skipped";
export type StepStatus = "passed" | "failed" | "skipped";

export interface StepError {
  message: string;
  type?: string;
  stack?: string;
}

export interface StepResult {
  id: string;
  action: string;
  domain?: string;
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
  testDomain: "ui" | "api" | "system";
  executionMode: ExecutionMode;
  status: TestStatus;
  startedAt: string;
  endedAt: string;
  steps: StepResult[];
}

export interface RunSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}

export interface RunResult {
  schemaVersion: "v1";
  runId: string;
  suiteId: string;
  suiteName?: string;
  suitePath?: string;
  executionMode: ExecutionMode;
  startedAt: string;
  endedAt: string;
  tests: TestResult[];
  summary: RunSummary;
}
