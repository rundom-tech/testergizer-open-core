// src/core/locators/clrDefinition.ts

import type { LocatorDictionary } from "./types";

export interface CLRDefinition {
  appId: string;
  versionRange: string;
  domFingerprint?: string;
  locators: LocatorDictionary;
}
