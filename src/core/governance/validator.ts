// src/core/governance/validator.ts
import { ApiExecutable } from "../api/types";

export class GovernanceValidator {
  /**
   * Internal resolver to avoid external 'jsonpath' dependency.
   * Matches the logic implemented in ApiExecutor for Sprint 4.
   */
  private resolvePath(payload: any, path: string): any {
    if (!path) return undefined;
    let normalized = path.startsWith('$') ? path.substring(1) : path;
    if (normalized.startsWith('.')) normalized = normalized.substring(1);
    normalized = normalized.replace(/\[(\d+)\]/g, '.$1');
    if (normalized.startsWith('.')) normalized = normalized.substring(1);
    if (!normalized) return payload;

    return normalized.split('.').reduce((acc, part) => {
      return acc !== undefined && acc !== null ? acc[part] : undefined;
    }, payload);
  }

  public validate(test: ApiExecutable, responseBody: any): string[] {
    const errors: string[] = [];
    // Existing validation logic using this.resolvePath...
    return errors;
  }
}