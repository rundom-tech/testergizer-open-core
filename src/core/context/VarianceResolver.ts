import { ExecutionContext } from "./ExecutionContext";

export class VarianceResolver {
  private context: ExecutionContext;

  constructor(context: ExecutionContext) {
    this.context = context;
  }

  /**
   * Resolves a string containing variables. 
   * If the string is an EXACT match for a single variable, it preserves the original type.
   */
  public resolveString(value: string): any {
    if (!value) return value;

    // 1. Exact Match Short-Circuit (Preserves Types)
    const exactMatch = value.match(/^{{([^}]+)}}$/);
    if (exactMatch) {
      const key = exactMatch[1].trim();
      const rawValue = this.context.get(key);
      
      // If the context returns the unresolved template string, fallback. 
      // Otherwise, return the native type (boolean, number, object, etc.)
      if (rawValue !== `{{${key}}}`) {
        return rawValue;
      }
    }

    // 2. Standard Mixed-String Replacement
    return value.replace(/{{([^}]+)}}/g, (_, key) => {
      const val = this.context.get(key.trim());
      // Coerce to string for inline replacements
      return val !== undefined ? String(val) : `{{${key}}}`;
    });
  }

  /**
   * Recursively traverses an object or array and resolves all template strings.
   */
  public resolveObject(obj: any): any {
    if (obj === null || obj === undefined) return obj;

    if (typeof obj === 'string') {
      return this.resolveString(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.resolveObject(item));
    }

    if (typeof obj === 'object') {
      const resolved: any = {};
      for (const [key, value] of Object.entries(obj)) {
        resolved[key] = this.resolveObject(value);
      }
      return resolved;
    }

    return obj;
  }
}