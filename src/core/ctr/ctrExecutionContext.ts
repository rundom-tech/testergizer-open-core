// src/core/locators/ctrExecutionContext.ts

import type {
  ExecutionEngine,
  ExecutionIntent,
  ValidationMode
} from "../types";

export interface CTRExecutionContext {
  executionEngine: ExecutionEngine;
  executionIntent: ExecutionIntent;
  validationMode: ValidationMode;

  // Declared AUT version (from CLI or suite)
  autVersion?: string;

  // Detected AUT version at runtime (live engine only)
  detectedAutVersion?: string;

  // Detected DOM fingerprint (live engine only)
  detectedDomFingerprint?: string;

  baseUrl?: string;
}