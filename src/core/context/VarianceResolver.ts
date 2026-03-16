// src/core/context/VarianceResolver.ts
import * as os from 'os';
import * as path from 'path';
import { ExecutionContext } from './ExecutionContext';

export class VarianceResolver {
  constructor(private context: ExecutionContext) {}

  /**
   * Resolves string macros by checking the execution context,
   * falling back to system environment variables, and expanding path aliases.
   */
  resolveString(input: string): string {
    if (!input || typeof input !== 'string') return input;

    // Quality Intelligence Environment Mapping: Intercept {{VARIABLES}}
    let resolved = input.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      const trimmedKey = key.trim();

      // 1. Check the dynamic execution context first (Highest Priority)
      const ctxValue = this.context.get(trimmedKey);
      if (ctxValue !== undefined && ctxValue !== null) {
        return String(ctxValue);
      }

      // 2. Cross-platform universal home directory macro
      if (trimmedKey === 'HOME' || trimmedKey === '~') {
        return os.homedir();
      }

      // 3. Fallback to native OS environment variables (e.g., USERPROFILE, APPDATA)
      if (process.env[trimmedKey] !== undefined) {
        return String(process.env[trimmedKey]);
      }

      // Leave unresolved if no match is found
      return match;
    });

    // Quality Intelligence Tilde Expansion: Seamlessly translate ~/ paths
    if (resolved.startsWith('~/') || resolved.startsWith('~\\')) {
      resolved = path.join(os.homedir(), resolved.slice(2));
    }

    return resolved;
  }

  /**
   * Recursively traverses objects and arrays to resolve nested strings.
   */
  resolveObject(obj: any): any {
    if (obj === null || obj === undefined) return obj;

    if (typeof obj === 'string') {
      return this.resolveString(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.resolveObject(item));
    }

    if (typeof obj === 'object') {
      const resolvedObj: any = {};
      for (const [key, value] of Object.entries(obj)) {
        resolvedObj[key] = this.resolveObject(value);
      }
      return resolvedObj;
    }

    return obj; // Return primitives (numbers, booleans) as-is
  }
}