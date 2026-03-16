// src/core/locators/ctrDefinition.ts

import type { LocatorDictionary } from "./ctrTypes";

export interface CTRDefinition {
  appId: string;
  versionRange: string;
  domFingerprint?: string;
  locators: LocatorDictionary;
}
