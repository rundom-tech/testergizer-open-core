export type ExecutionMode = "playwright" | "stub";

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
  value?: string | number;
  timeoutMs?: number;
}

export interface JsonTestDefinition {
  id: string;
  steps: JsonStep[];
}