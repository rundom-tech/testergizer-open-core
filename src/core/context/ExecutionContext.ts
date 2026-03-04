// src/core/context/ExecutionContext.ts
import crypto from "crypto";

export type MacroFunction = () => string | number;

export interface ExecutionState {
  variables: Record<string, any>;
  macros: Record<string, MacroFunction>;
}

export class ExecutionContext {
  private state: ExecutionState;

  constructor(initialVariables: Record<string, any> = {}) {
    this.state = {
      variables: { ...initialVariables },
      macros: {
        $guid: () => crypto.randomUUID(),
        $timestamp: () => Date.now(),
        $isoDate: () => new Date().toISOString()
      }
    };
  }

  /**
   * Retrieves a variable or executes a macro based on the key prefix.
   */
  public get(key: string): any {
    if (key.startsWith("$")) {
      const macro = this.state.macros[key];
      return macro ? macro() : `{{${key}}}`;
    }
    
    return this.state.variables[key] !== undefined 
      ? this.state.variables[key] 
      : `{{${key}}}`;
  }

  /**
   * Allows injecting or updating variables mid-execution.
   */
  public set(key: string, value: any): void {
    this.state.variables[key] = value;
  }
}