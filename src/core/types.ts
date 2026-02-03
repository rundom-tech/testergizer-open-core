export type ExecutionMode = "stub" | "execute" | "baseline";

export type TestDomain = "ui" | "api" | "system";

export type StepAction =
  | "goto"
  | "click"
  | "fill"
  | "assertVisible"
  | "assertText"
  | "waitFor";

export interface JsonStep {
  id: string;
  action: StepAction;
  /** URL for goto or selector for DOM operations */
  target?: string;
  /** Used by fill, waitFor (ms), assertText expected substring */
  value?: string | number | boolean;
  timeoutMs?: number;
}

export interface JsonTestDefinition {
  id: string;
  /** Optional descriptive name */
  name?: string;
  /** Descriptive only; does not affect execution in Open Core */
  testDomain?: TestDomain;
  steps: JsonStep[];
}

export interface JsonSuite {
  schemaVersion: "v1";
  suiteId: string;
  suiteName: string;
  /** Optional: resolved by CLI/runSuiteFromFile */
  suitePath?: string;
  /** Optional: target system URL (may be used by baseUrl) */
  baseUrl?: string;
  tests: JsonTestDefinition[];
}

export interface CoreRunnerOptions {
  headless?: boolean;
  slowMoMs?: number;
  baseUrl?: string;
  executionMode?: ExecutionMode;
  retries?: number;

  /** Playwright browser family (maps to Playwright project semantics) */
  browserName?: "chromium" | "firefox" | "webkit";

  /** Step retry configuration (Open Core) */
  stepRetries?: number;
  /** If provided, retry only these step IDs */
  retryStepIds?: string[];
  retryDelayMs?: number;
}
