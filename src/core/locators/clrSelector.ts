import { satisfies } from "semver";
import type { CLRDefinition } from "./clrDefinition";

export type CLRMatchStatus =
  | "match"
  | "version_mismatch"
  | "demo_mismatch";

export interface CLRMatchResult {
  status: CLRMatchStatus;
  definition: CLRDefinition;
}

export function validateCLRForVersion(
  clr: CLRDefinition,
  autVersion: string
): CLRMatchResult {

  if (autVersion === "demo") {
    if (clr.versionRange === "demo") {
      return { status: "match", definition: clr };
    }
    return { status: "demo_mismatch", definition: clr };
  }

  if (clr.versionRange === "demo") {
    return { status: "demo_mismatch", definition: clr };
  }

  const ok = satisfies(autVersion, clr.versionRange, {
    includePrerelease: true
  });

  return ok
    ? { status: "match", definition: clr }
    : { status: "version_mismatch", definition: clr };
}
