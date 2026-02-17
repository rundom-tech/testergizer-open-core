// src/core/locators/clrDefinition.ts

export interface LocatorStrategy {
  /**
   * Strategy identifier (must be registered in StrategyRegistry)
   */
  strategy: string;

  /**
   * Strategy-specific payload
   */
  value: unknown;
}

export interface LocatorEntry {
  /**
   * Logical contexts where this locator is valid.
   */
  contexts: string[];

  /**
   * Ordered strategies.
   * Order is authoritative.
   */
  strategies: LocatorStrategy[];

  /**
   * Optional human-readable description.
   */
  description?: string;
}

export interface CLRDefinition {
  /**
   * Logical application identifier.
   */
  appId: string;

  /**
   * Version range (SemVer) or sentinel "demo".
   */
  versionRange: string;

  /**
   * Optional structural fingerprint (future use).
   */
  domFingerprint?: string;

  /**
   * Logical locator registry.
   */
  locators: Record<string, LocatorEntry>;
}
