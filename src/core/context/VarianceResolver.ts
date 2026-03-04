// src/core/context/VarianceResolver.ts
import { ExecutionContext } from "./ExecutionContext";

export class VarianceResolver {
  private context: ExecutionContext;

  constructor(context: ExecutionContext) {
    this.context = context;
  }

  /**
   * Resolves inline variables and macros within a string.
   */
  public resolveString(template: string): string {
    if (typeof template !== "string") return template;

    return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
      const cleanKey = key.trim();
      const resolvedValue = this.context.get(cleanKey);
      
      return typeof resolvedValue === "object" 
        ? JSON.stringify(resolvedValue) 
        : String(resolvedValue);
    });
  }

  /**
   * Recursively traverses objects and arrays to resolve all string values.
   */
  public resolveObject<T>(target: T): T {
    if (target === null || target === undefined) {
      return target;
    }

    if (typeof target === "string") {
      return this.resolveString(target) as unknown as T;
    }

    if (Array.isArray(target)) {
      return target.map((item) => this.resolveObject(item)) as unknown as T;
    }

    if (typeof target === "object") {
      const resolvedObj: Record<string, any> = {};
      for (const [key, value] of Object.entries(target)) {
        resolvedObj[key] = this.resolveObject(value);
      }
      return resolvedObj as T;
    }

    return target;
  }
}