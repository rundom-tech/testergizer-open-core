// src/core/locators/clrVersionGuard.ts

import { satisfies } from "semver";
import type { CLRExecutionContext } from "./clrExecutionContext";

export type CLRVersionStatus =
  | "match"
  | "out_of_range"
  | "skipped";

export interface CLRVersionCheckResult {
  status: CLRVersionStatus;
  reason?: "clr_demo_sentinel" | "executionType_model";
  detectedVersion?: string;
  expectedRange?: string;
}

export function evaluateVersionRange(
  versionRange: string,
  context: CLRExecutionContext
): CLRVersionCheckResult {
  // Model execution → not applicable
  if (context.executionType === "model") {
    return {
      status: "skipped",
      reason: "executionType_model",
      expectedRange: versionRange,
    };
  }

  // Demo sentinel → explicitly skipped
  if (versionRange === "demo") {
    return {
      status: "skipped",
      reason: "clr_demo_sentinel",
      detectedVersion: context.detectedAutVersion,
      expectedRange: versionRange,
    };
  }

  const detected = context.detectedAutVersion;

  if (!detected) {
    return {
      status: "out_of_range",
      detectedVersion: undefined,
      expectedRange: versionRange,
    };
  }

  const ok = satisfies(detected, versionRange, { includePrerelease: true });

  return {
    status: ok ? "match" : "out_of_range",
    detectedVersion: detected,
    expectedRange: versionRange,
  };
}
