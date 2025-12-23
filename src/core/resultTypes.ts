export type TestStatus = "passed" | "failed" | "skipped";
export type StepStatus = "passed" | "failed" | "skipped";
import { ExecutionMode } from "./types";

export type TestDomain =
  | "ui"
  | "api"
  | "system";

export type StepDomain =
  | "ui"
  | "api"
  | "fs"
  | "db"
  | "queue"
  | "external"
  | "other";

export interface StepError {
  message: string;
  type?: string;
  stack?: string;
}

export interface StepResult {
  id: string;
  action: string;
  domain?: StepDomain;
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
  status: TestStatus;
  startedAt: string;
  endedAt: string;
  steps: StepResult[];
}
