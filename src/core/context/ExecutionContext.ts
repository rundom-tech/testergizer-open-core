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
   * VALIDATION: Prevents overwriting reserved system macro keys.
   */
  public set(key: string, value: any, transform?: 'number' | 'string' | 'boolean'): void {
    // Check if the key conflicts with a defined macro
    if (key.startsWith("$") && this.state.macros[key]) {
      throw new Error(`Protection Violation: Cannot overwrite system macro "${key}".`);
    }

    let finalValue = value;
    
    // Type Transformation Logic
    if (transform === 'number') finalValue = Number(value);
    if (transform === 'boolean') finalValue = (value === 'true' || value === true);
    if (transform === 'string') finalValue = String(value);

    this.state.variables[key] = finalValue;
  }
}