// src/core/locators/ctrDefinition.ts

import type { LocatorDictionary } from "./types";

export interface CTRDefinition {
  appId: string;
  versionRange: string;
  domFingerprint?: string;
  locators: LocatorDictionary;
}
