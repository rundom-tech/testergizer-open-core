// src/core/governance/validator.ts
import { ApiExecutable } from "../api/types";

export class GovernanceValidator {
  /**
   * Internal resolver with wildcard [*] support to avoid external dependencies.
   */
  private resolvePath(payload: any, path: string): any {
    if (!path) return undefined;
    let normalized = path.startsWith('$') ? path.substring(1) : path;
    if (normalized.startsWith('.')) normalized = normalized.substring(1);
    
    // Normalize array notations: [0] -> .0 and [*] -> .*
    normalized = normalized.replace(/\[(\d+)\]/g, '.$1');
    normalized = normalized.replace(/\[\*\]/g, '.*');
    if (normalized.startsWith('.')) normalized = normalized.substring(1);
    
    if (!normalized) return payload;
    
    const parts = normalized.split('.');
    
    // Recursive traversal to handle branching on '*'
    const traverse = (current: any, index: number): any => {
      if (current === undefined || current === null) return undefined;
      if (index >= parts.length) return current;
      
      const part = parts[index];
      
      // Wildcard array mapping
      if (part === '*') {
        if (!Array.isArray(current)) return undefined;
        // Map the rest of the path over every element in the array
        return current.map(item => traverse(item, index + 1));
      }
      
      return traverse(current[part], index + 1);
    };

    return traverse(payload, 0);
  }

  /**
   * Validates a step's assertions against the actual API response.
   */
  public validate(test: ApiExecutable, responseBody: any, statusCode?: number): string[] {
    const errors: string[] = [];
    
    // Safely extract assertions if they exist on the step
    const assertions = (test as any).assertions || [];

    for (const assertion of assertions) {
      // 1. Status Code Validation
      if (assertion.check === 'status_code' && statusCode !== undefined) {
        if (statusCode !== assertion.expected) {
          errors.push(`[status_code] Expected ${assertion.expected}, got ${statusCode}`);
        }
      }

      // 2. JSON Path Validation
      if (assertion.check === 'json_path') {
        const actual = this.resolvePath(responseBody, assertion.path);

        if (assertion.path.includes('[*]')) {
          // SPRINT 4: Wildcard Array Check
          if (!Array.isArray(actual)) {
            errors.push(`[json_path] Path '${assertion.path}' did not resolve to an array.`);
          } else {
            // Verify EVERY item in the mapped array matches the expected variable
            const allMatch = actual.every((val: any) => val === assertion.expected);
            if (!allMatch) {
              errors.push(`[json_path] Path '${assertion.path}' mismatch. Not all array elements matched expected: "${assertion.expected}"`);
            }
          }
        } else {
          // Standard Exact Check
          if (actual !== assertion.expected) {
            errors.push(`[json_path] Path '${assertion.path}' mismatch. Expected: "${assertion.expected}", Actual: "${actual}"`);
          }
        }
      }
    }

    return errors;
  }
}