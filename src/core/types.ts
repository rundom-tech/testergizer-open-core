// src/core/types.ts
import { TestMatrix } from './enums';

// Core types and interfaces for test definitions, execution options, and artifact observation.
export type ExecutionEngine =
  | "testergizer"
  | "playwright"
  | "api"; // ← API testing engine

export type ExecutionIntent =
  | "review"
  | "verify"
  | "baseline";

export type ValidationMode =
  | "strict"
  | "debug";

/**
 * Defines a deterministic assertion boundary.
 */
export interface Assertion {
  target: string;
  matcher: string;
  value: any;
}

/**
 * Defines the reference to an external Data Matrix source.
 */
export interface VarianceReference {
  sourceType: 'JSON' | 'CSV';
  filePath: string;
}

/**
 * Represents a single row from a variance matrix.
 * Supports compile-time flow injection to ensure linear runtime execution.
 */
export interface VarianceDataRow {
  variationId: string;
  description?: string;
  inputs: Record<string, any>;
  expect?: Assertion[];
  actions?: JsonStep[]; // Quality Intelligence: overrides base flow at compile time
}

export type TestDomain = "ui" | "api" | "system" | string;

export type StepAction =
  | "goto"
  | "click"
  | "fill"
  | "assertVisible"
  | "assertText"
  | "waitFor"
  | string;

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
  target?: string | { value: string; resolved?: boolean } | any;
  
  // Data inputs
  data?: any;
  value?: any;
  input?: any;
  
  // API Specific
  method?: string;
  payload?: any;
  assertions?: any[];
  
  // Execution Control
  timeoutMs?: number; 
  
  // SPRINT 4: State Capture
  extract?: ExtractInstruction[];
  
  group?: { name: string } | string | any;

  // Flexible catch-all for custom executor properties
  [key: string]: any;
}

/**
 * The base JSON Test Definition before matrix unrolling is applied.
 * Unified to support both legacy domain/steps and modern matrix/actions.
 */
export interface JsonTestDefinition {
  id: string;
  /** Optional descriptive name/title */
  name?: string;
  title?: string;
  
  /** Descriptive only; for backward compatibility */
  testDomain?: TestDomain | TestDomain[];
  
  /** Quality Intelligence: Bitwise execution routing matrix */
  testMatrix?: TestMatrix | number;
  
  /** Execution instructions (supports both legacy 'steps' and modern 'actions') */
  steps?: JsonStep[];
  actions?: JsonStep[];
  
  /** Quality Intelligence: Data Variance injection */
  variance?: VarianceReference; 
  expect?: Assertion[];

  apiDefinition?: {
    baseUrl: string;
    endpoints: Record<string, string>;
  };
}

/**
 * The Testlet: The atomic, immutable unit of execution passed to the TestExecutor.
 * Represents the conceptual contract built by fusing the flow, inputs, and assertions.
 */
export interface UnrolledTestlet {
  instanceId: string; 
  parentTestId: string;
  description?: string;
  testDomain?: TestDomain | TestDomain[];
  testMatrix?: TestMatrix | number;
  actions: JsonStep[];
  inputs: Record<string, any>;
  expect: Assertion[];
}

export interface JsonSuite {
  schemaVersion: "v1" | "v2" | string;
  suiteId: string;
  suiteName: string;
  /** Optional: resolved by CLI/runSuiteFromFile */
  suitePath?: string;
  /** Optional: target system URL (may be used by baseUrl) */
  baseUrl?: string;
  tests: any[];
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
  autVersion?: string;

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
  ctrDefinition?: any; // Accept the CTR definition for API testing
  /** Common Central Target Registry (CCTR)
   *  Quality Intelligence: Provides a unified registry for known obstacles and their resolution strategies across the ecosystem.
   */
  cctr?: {
    globalUrl?: string;
    localPath?: string;
  };
}