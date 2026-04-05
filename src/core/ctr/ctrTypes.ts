export interface CtrSelector {
  using: "css" | "xpath" | "text" | "role" | "testid"| "aria" | "label" | "placeholder";
  value: string;
}

export interface LocatorDefinition {
  strategy?: "firstMatch";
  contexts?: string[];
  selectors: CtrSelector[];
}

export type LocatorDictionary = Record<string, LocatorDefinition>;

export interface ParsedTarget {
  context: string;
  logicalName: string;
  type: string;
  elementKey: string; // logicalName.type
}

export interface ResolutionAttempt {
  using: CtrSelector["using"];
  value: string;
  result: "success" | "not_found";
}

export interface LocatorResolutionResult<THandle = unknown> {
  resolved: boolean;
  handle?: THandle;
  resolvedBy?: CtrSelector;
  attempts: ResolutionAttempt[];
}

export interface StrategyExecutor<THandle = unknown> {
  tryResolve(selector: CtrSelector): Promise<THandle | null>;
}
