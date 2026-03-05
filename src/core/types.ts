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

// Add this new interface to define the Sprint 4 extraction rules
export interface ExtractInstruction {
  /** The variable name to store in the ExecutionContext */
  as: string;
  
  /** JSONPath selector for API responses (e.g., "$.data.userId") */
  path?: string;
  
  /** DOM property for UI extraction (e.g., "innerText", "value") */
  property?: string;
  
  /** DOM attribute for UI extraction (e.g., "data-test-id", "href") */
  attribute?: string;
  
  /** Optional type casting before storing in context */
  transform?: "number" | "string" | "boolean";
}

// Update your existing JsonStep interface to include the extract property
export interface JsonStep {
  id: string;
  action: string;
  target?: string | { value: string; resolved?: boolean };
  
  // Data inputs
  data?: any;
  value?: any;
  input?: any;
  
  // API Specific
  method?: string;
  payload?: any;
  assertions?: any[];
  
  // Execution Control
  timeoutMs?: number; // <== Add this back
  
  // SPRINT 4: State Capture
  extract?: ExtractInstruction[];
  
  group?: string;
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
