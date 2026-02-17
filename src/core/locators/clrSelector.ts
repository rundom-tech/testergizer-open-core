// src/core/locators/clrSelector.ts

import { satisfies } from "semver";
import type { CLRDefinition } from "./definition";

export function selectCLRForVersion(
  definitions: CLRDefinition[],
  detectedAutVersion: string
): CLRLoadResult {
  const matches = definitions.filter(def =>
    def.versionRange !== "demo" &&
    satisfies(detectedAutVersion, def.versionRange, {
      includePrerelease: true,
    })
  );

  if (matches.length === 0) {
    return { status: "not_found" };
  }

  if (matches.length > 1) {
    return { status: "ambiguous", matches };
  }

  return { status: "match", definition: matches[0] };
}
