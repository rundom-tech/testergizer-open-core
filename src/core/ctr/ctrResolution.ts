// src/core/locators/ctrResolution.ts

import type { CTRVersionCheckResult } from "./ctrVersionGuard";
import type { CTRDomCheckResult } from "./ctrDomGuard";

export interface CTRResolution {
  appId: string;
  versionRange: string;

  versionCheck: CTRVersionCheckResult;
  domCheck: CTRDomCheckResult;

  strategyRegistry: {
    registered: string[];
  };

  resolvedAt: string;
}
