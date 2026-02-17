// src/core/locators/clrExecutionContext.ts

export type ExecutionType = "live" | "model";

export interface CLRExecutionContext {
  executionType: ExecutionType;

  /**
   * AUT version detected at runtime.
   * Undefined in model mode.
   */
  detectedAutVersion?: string;

  /**
   * DOM fingerprint detected at runtime.
   * Undefined in model mode.
   */
  detectedDomFingerprint?: string;
}
