// src/core/locators/ctrDomGuard.ts

import type { CTRExecutionContext } from "./ctrExecutionContext";

export type CTRDomStatus =
  | "match"
  | "drift"
  | "not_configured"
  | "not_implemented"
  | "skipped";

export interface CTRDomCheckResult {
  status: CTRDomStatus;
  reason?: "engine_testergizer";
  expectedFingerprint?: string;
  detectedFingerprint?: string;
}

export function evaluateDomFingerprint(
  expectedFingerprint: string | undefined,
  context: CTRExecutionContext
): CTRDomCheckResult {
  if (context.executionEngine === "testergizer") {
    return {
      status: "skipped",
      reason: "engine_testergizer",
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
