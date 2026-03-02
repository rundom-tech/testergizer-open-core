// src/core/types.ts
// Core types and interfaces for test definitions, execution options, and artifact observation.
export type ExecutionEngine =
  | "testergizer"
  | "playwright"
  | "api"; // ← NEW: API testing engine

export type ExecutionIntent =
  | "review"
  | "verify"
  | "baseline";

export type ValidationMode =
  | "strict"
  | "debug";

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
  apiDefinition?: {
    baseUrl: string;
    endpoints: Record<string, string>;
  };
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

/** Minimal observer contract for append-only runtime evidence. */
export interface ArtifactObserver {
  append(entry: unknown): void;
}

export interface TestExecutorOptions {
  headless?: boolean;
  slowMoMs?: number;
  baseUrl?: string;
  executionEngine?: ExecutionEngine;
  executionIntent?: ExecutionIntent;
  validationMode?: ValidationMode;
  retries?: number;
  autVersion?: string; // ← NEW

  /** Playwright browser family (maps to Playwright project semantics) */
  browserName?: "chromium" | "firefox" | "webkit";

  /** Step retry configuration (Open Core) */
  stepRetries?: number;
  /** If provided, retry only these step IDs */
  retryStepIds?: string[];
  retryDelayMs?: number;

  /**
   * Optional artifact capture for a single run session.
   * Purely additive: disabling artifacts must not change execution semantics.
   */
  artifacts?: {
    enabled: boolean;
    /** Absolute or run-root-relative directory. CoreRunner will create attempt folders under it. */
    dir: string;
    trace?: "on-failure";
    video?: "on-failure";
    screenshot?: "on-failure";
  };

  /** Optional append-only observer for artifacts (writes are performed by the CLI layer). */
  artifactObserver?: ArtifactObserver;
  ctrDefinition?: any; // 👈 NEW: Accept the CTR definition for API testing
}
