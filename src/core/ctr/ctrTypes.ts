export interface ClrSelector {
  using: "css" | "xpath" | "text" | "role" | "testid"| "aria" | "label" | "placeholder";
  value: string;
}

export interface LocatorDefinition {
  strategy?: "firstMatch";
  contexts?: string[];
  selectors: ClrSelector[];
}

export type LocatorDictionary = Record<string, LocatorDefinition>;

export interface ParsedTarget {
  context: string;
  logicalName: string;
  type: string;
  elementKey: string; // logicalName.type
}

export interface ResolutionAttempt {
  using: ClrSelector["using"];
  value: string;
  result: "success" | "not_found";
}

export interface LocatorResolutionResult<THandle = unknown> {
  resolved: boolean;
  handle?: THandle;
  resolvedBy?: ClrSelector;
  attempts: ResolutionAttempt[];
}

export interface StrategyExecutor<THandle = unknown> {
  tryResolve(selector: ClrSelector): Promise<THandle | null>;
}
