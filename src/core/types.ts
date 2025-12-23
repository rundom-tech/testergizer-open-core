export type ExecutionMode =
  | "stub"
  | "verify"
  | "update"
  | "execute";


export interface CoreRunnerOptions {
  headless?: boolean;
  slowMoMs?: number;
  baseUrl?: string;
  executionMode?: ExecutionMode;
}

export interface JsonStep {
  id: string;
  action: string;
  target?: string;
  value?: unknown;
  timeoutMs?: number;

  /** Technical domain of the step */
  domain?: "ui" | "api" | "fs" | "db" | "queue" | "external" | "other";
}


export interface JsonTestDefinition {
  id: string;

  /** Optional human-readable name */
  name?: string;

  /** Primary intent of the test */
  testDomain?: "ui" | "api" | "system";

  steps: JsonStep[];
}
