export type LocatorStrategy = "css" | "xpath" | "text" | "role";

export interface JsonStep {
  action:
    | "goto"
    | "click"
    | "fill"
    | "assertVisible"
    | "assertText"
    | "waitFor";
  target?: string;
  value?: string;
  timeoutMs?: number;
}

export interface JsonTestDefinition {
  name: string;
  description?: string;
  steps: JsonStep[];
}

export interface CoreRunnerOptions {
  headless?: boolean;
  slowMoMs?: number;
  baseUrl?: string;
}
