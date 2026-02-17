// src/core/locators/clrResolution.ts

import type { CLRVersionCheckResult } from "./clrVersionGuard";
import type { CLRDomCheckResult } from "./clrDomGuard";

export interface CLRResolution {
  appId: string;
  versionRange: string;

  versionCheck: CLRVersionCheckResult;
  domCheck: CLRDomCheckResult;

  strategyRegistry: {
    registered: string[];
  };

  resolvedAt: string;
}
