// src/core/locators/clrVersionGuard.ts

import { satisfies } from "semver";
import type { CLRExecutionContext } from "./clrExecutionContext";
import type { CLRDefinition } from "./clrDefinition";

export type CLRVersionStatus =
  | "match"
  | "out_of_range"
  | "skipped";

export interface CLRVersionCheckResult {
  status: CLRVersionStatus;
  reason?: "executionType_model" | "demo_mode";
  detectedVersion?: string;
  expectedRange?: string;
}

export function evaluateVersionCompatibility(
  definition: CLRDefinition,
  context: CLRExecutionContext
): CLRVersionCheckResult {

  // Model mode → no real AUT
  if (context.executionType === "model") {
    return {
      status: "skipped",
      reason: "executionType_model",
      expectedRange: definition.versionRange,
    };
  }

  // Demo CLR → version not applicable
  if (definition.versionRange === "demo") {
    return {
      status: "skipped",
      reason: "demo_mode",
      detectedVersion: context.detectedAutVersion,
      expectedRange: definition.versionRange,
    };
  }

  const detected = context.detectedAutVersion;

  if (!detected || detected === "demo") {
    return {
      status: "out_of_range",
      detectedVersion: detected,
      expectedRange: definition.versionRange,
    };
  }

  const ok = satisfies(detected, definition.versionRange, {
    includePrerelease: true,
  });

  return {
    status: ok ? "match" : "out_of_range",
    detectedVersion: detected,
    expectedRange: definition.versionRange,
  };
}
