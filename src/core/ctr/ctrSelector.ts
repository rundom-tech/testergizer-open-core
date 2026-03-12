import { satisfies } from "semver";
import type { CTRDefinition } from "./ctrDefinition";

export type CTRMatchStatus =
  | "match"
  | "version_mismatch"
  | "demo_mismatch";

export interface CTRMatchResult {
  status: CTRMatchStatus;
  definition: CTRDefinition;
}

export function validateCTRForVersion(
  ctr: CTRDefinition,
  autVersion: string
): CTRMatchResult {

  if (autVersion === "demo") {
    if (ctr.versionRange === "demo") {
      return { status: "match", definition: ctr };
    }
    return { status: "demo_mismatch", definition: ctr };
  }

  if (ctr.versionRange === "demo") {
    return { status: "demo_mismatch", definition: ctr };
  }

  const ok = satisfies(autVersion, ctr.versionRange, {
    includePrerelease: true
  });

  return ok
    ? { status: "match", definition: ctr }
    : { status: "version_mismatch", definition: ctr };
}
