// src/core/locators/clrDomGuard.ts

import type { CLRExecutionContext } from "./clrExecutionContext";

export type CLRDomStatus =
  | "match"
  | "drift"
  | "not_configured"
  | "not_implemented"
  | "skipped";

export interface CLRDomCheckResult {
  status: CLRDomStatus;
  reason?: "executionType_model";
  expectedFingerprint?: string;
  detectedFingerprint?: string;
}

export function evaluateDomFingerprint(
  expectedFingerprint: string | undefined,
  context: CLRExecutionContext
): CLRDomCheckResult {
  if (context.executionType === "model") {
    return {
      status: "skipped",
      reason: "executionType_model",
    };
  }

  if (!expectedFingerprint) {
    return {
      status: "not_configured",
    };
  }

  // Beta phase — fingerprint comparison not implemented yet
  return {
    status: "not_implemented",
    expectedFingerprint,
    detectedFingerprint: context.detectedDomFingerprint,
  };
}
