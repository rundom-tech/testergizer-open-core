import { ExecutionMode, TestDomain } from "./types";

export type Status = "passed" | "failed" | "skipped";

export interface StepError {
  reason: string;
  message: string;
  stack?: string;
}

export interface StepResult {
  id: string;
  action: string;
  status: Status;
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
  status: Status;
  startedAt: string;
  endedAt: string;
  durationMs: number;
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
  suiteName: string;
  suitePath: string;
  executionMode: ExecutionMode;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  tests: TestResult[];
  summary: RunSummary;
}
