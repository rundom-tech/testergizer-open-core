export type LocatorBy = 'css' | 'xpath' | 'testId' | 'role' | 'text' | 'aria';

export interface LocatorStrategy {
  by: LocatorBy;
  value: string;
  name?: string; // for role/text/aria where needed
}

export interface LocatorDefinition {
  contexts: string[];
  strategies: LocatorStrategy[];
  description?: string;
}

export type LocatorDictionary = Record<string, LocatorDefinition>;

export interface ParsedTarget {
  context: string;
  logicalName: string;
  type: string;
  elementKey: string; // logicalName.type
}

export interface ResolutionAttempt {
  by: LocatorBy;
  value: string;
  name?: string;
  result: 'success' | 'not_found' | 'error';
  errorMessage?: string;
}

export interface LocatorResolutionResult {
  resolved: boolean;
  resolvedBy?: LocatorStrategy;
  attempts: ResolutionAttempt[];
}

export interface StrategyExecutor<THandle = unknown> {
  /**
   * Try resolving a strategy in the current execution surface.
   * Return a handle if found, or null if not found.
   * Throw only for "real" errors (driver errors), not for "not found".
   */
  tryResolve(strategy: LocatorStrategy): Promise<THandle | null>;
}
