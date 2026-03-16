// src/core/locators/ctrVersionGuard.ts

import { satisfies } from "semver";
import type { CTRExecutionContext } from "./ctrExecutionContext";
import type { CTRDefinition } from "./ctrDefinition";

export type CTRVersionStatus =
  | "match"
  | "out_of_range"
  | "skipped";

export interface CTRVersionCheckResult {
  status: CTRVersionStatus;
  reason?: "engine_testergizer" | "demo_mode";
  detectedVersion?: string;
  expectedRange?: string;
}

export function evaluateVersionCompatibility(
  definition: CTRDefinition,
  context: CTRExecutionContext
): CTRVersionCheckResult {

  // Model mode → no real AUT
  if (context.executionEngine === "testergizer") {
    return {
      status: "skipped",
      reason: "engine_testergizer",
      expectedRange: definition.versionRange,
    };
  }

  // Demo CTR → version not applicable
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
