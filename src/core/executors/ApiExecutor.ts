// src/core/executors/ApiExecutor.ts
import { ApiExecutable, ApiAssertion } from "../api/types";
import { ApiTargetRegistry } from "../api/ApiRepository";
import { ExecutionContext } from "../context/ExecutionContext";
import { VarianceResolver } from "../context/VarianceResolver";

// Sprint 4: Define the extraction instruction structure
export interface ExtractInstruction {
  as: string;
  path: string;
  transform?: 'number' | 'string' | 'boolean';
}

// Extend the existing ApiExecutable locally for the Sprint 4 payload
export interface ApiExecutableWithExtraction extends ApiExecutable {
  extract?: ExtractInstruction[];
}

export class ApiExecutor {
  private registry: ApiTargetRegistry;

  constructor(registry: ApiTargetRegistry) {
    this.registry = registry;
  }

  /**
   * Safely resolves a JSONPath string against a payload object.
   * Supports standard dot notation ($.name), array indices ($[0].userId), 
   * and array wildcards ($[*].userId).
   */
  private resolveJsonPath(payload: any, path: string): any {
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
   * Executes the API test definition, evaluates assertions, and acts as the judge.
   * Now integrated with the Sprint 3 Variance Engine for dynamic data injection
   * and Sprint 4 State Capture for Output-to-Input chaining.
   */
  public async execute(
    test: ApiExecutableWithExtraction, 
    variables: Record<string, any> = {}, 
    sharedContext?: ExecutionContext
  ): Promise<any> {
    
    // 1. Initialize Context & Resolver
    // Use sharedContext if provided by the orchestrator loop (Sprint 4), otherwise create new (Sprint 3)
    const context = sharedContext || new ExecutionContext(variables);
    const resolver = new VarianceResolver(context);

    // 2. Resolve target from the Registry
    const target = this.registry.getEndpoint(test.targetRef);
    if (!target) {
      throw new Error(`[API Executor] TargetRef '${test.targetRef}' not found in the CTR.`);
    }

    // 3. Domain-Agnostic Variance Resolution
    // Resolves placeholders in URL (string), Headers (object), and Payload (object)
    const url = resolver.resolveString(target.url);
    const method = test.method || target.defaultMethod || 'GET';
    
    // Deep resolution of headers to support dynamic macros like {{$guid}}
    const rawHeaders = target.headers ? { ...target.headers } : {};
    const resolvedHeaders = resolver.resolveObject(rawHeaders);
    
    // Deep resolution of the JSON payload for data-driven testing
    // SPRINT 4 FIX: Support both 'data' and 'payload' properties depending on schema
    const rawPayload = (test as any).data !== undefined ? (test as any).data : test.payload;
    const payload = rawPayload !== undefined ? resolver.resolveObject(rawPayload) : undefined;

    // 4. Diagnostic Logging for Sprint 3 Verification
    console.log(`[API] Dispatching ${method} -> ${url}`);
    console.log(`[API] Resolved Headers:`, JSON.stringify(resolvedHeaders, null, 2));

    // 5. The Fetch Action & Timing
    const startTime = performance.now();
    const response = await fetch(url, {
      method,
      headers: resolvedHeaders as Record<string, string>,
      body: payload ? JSON.stringify(payload) : undefined
    });
    const durationMs = performance.now() - startTime;

    // 6. Package Live Data
    const status_code = response.status;
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key.toLowerCase()] = value;
    });

    let body: any = {};
    const rawText = await response.text();
    try {
      body = JSON.parse(rawText);
    } catch {
      body = { text: rawText };
    }

    // 7. The Assertion Engine (The Judge) with Transparency Audit
    const assertionErrors: string[] = [];
    const audit: any[] = []; // NEW: Tracks all evaluations, passing or failing

    // SPRINT 4 FIX: Resolve all {{variables}} inside the assertions array before evaluating
    const resolvedAssertions = test.assertions ? resolver.resolveObject(test.assertions) : [];

    if (resolvedAssertions && resolvedAssertions.length > 0) {
      for (const assertion of resolvedAssertions) {
        switch (assertion.check) {
          
          case 'status_code':
            if (status_code !== assertion.expected) {
              assertionErrors.push(`[status_code] Expected ${assertion.expected}, got ${status_code}`);
              audit.push({ check: 'status_code', path: 'HTTP Status', passed: false, detail: `Expected ${assertion.expected}, got ${status_code}` });
            } else {
              audit.push({ check: 'status_code', path: 'HTTP Status', passed: true, detail: `Matched expected ${status_code}` });
            }
            break;

          case 'json_path': {
            if (!assertion.path) {
              assertionErrors.push(`[json_path] Missing 'path' property for assertion.`);
              audit.push({ check: 'json_path', path: 'N/A', passed: false, detail: `Missing 'path' property` });
              break;
            }

            // USE THE ROBUST NORMALIZER INSTEAD OF THE LIGHTWEIGHT SPLIT
            const actualValue = this.resolveJsonPath(body, assertion.path);

            if (assertion.path.includes('[*]')) {
              // SPRINT 4: Wildcard Array Check
              if (!Array.isArray(actualValue)) {
                assertionErrors.push(`[json_path] Path '${assertion.path}' did not resolve to an array.`);
                audit.push({ check: 'json_path', path: assertion.path, passed: false, detail: `Target did not resolve to an array` });
              } else if (actualValue.length === 0) {
                // SPRINT 4: Protect against false positives on empty arrays
                assertionErrors.push(`[json_path] Path '${assertion.path}' mismatch. Array is empty.`);
                audit.push({ check: 'json_path', path: assertion.path, passed: false, detail: `Array is empty. Cannot verify elements.` });
              } else {
                // Use loose string comparison because VarianceResolver may inject expected values as strings
                const expectedStr = String(assertion.expected);
                const allMatch = actualValue.every((val: any) => String(val) === expectedStr);
                
                if (!allMatch) {
                  assertionErrors.push(`[json_path] Path '${assertion.path}' mismatch. Not all array elements matched expected: "${assertion.expected}"`);
                  audit.push({ check: 'json_path', path: assertion.path, passed: false, detail: `Not all array elements strictly matched "${assertion.expected}"` });
                } else {
                  // Transparent Success Registration
                  audit.push({ check: 'json_path', path: assertion.path, passed: true, detail: `Verified ${actualValue.length}/${actualValue.length} items matched "${assertion.expected}"` });
                }
              }
            } else {
              // Standard Exact Check
              // Allows strict object matching OR loose primitive matching (e.g. injected "1" == 1)
              const isMatch = JSON.stringify(actualValue) === JSON.stringify(assertion.expected) || 
                              String(actualValue) === String(assertion.expected);

              if (!isMatch) {
                // Ensure undefined is clearly reported instead of vanishing
                const displayActual = actualValue === undefined ? "undefined" : JSON.stringify(actualValue);
                const displayExpected = JSON.stringify(assertion.expected);
                assertionErrors.push(`[json_path] Path '${assertion.path}' mismatch. Expected: ${displayExpected}, Actual: ${displayActual}`);
                audit.push({ check: 'json_path', path: assertion.path, passed: false, detail: `Mismatch. Expected: ${displayExpected}, Actual: ${displayActual}` });
              } else {
                audit.push({ check: 'json_path', path: assertion.path, passed: true, detail: `Matched expected value "${assertion.expected}"` });
              }
            }
            break;
          }

          default:
            assertionErrors.push(`[UNKNOWN_ASSERTION] The check '${(assertion as any).check}' is not supported.`);
        }
      }
    }

    // 8. Sprint 4: State Capture & Extraction
    const extractedData: Record<string, any> = {};
    
    if (test.extract && test.extract.length > 0) {
      for (const instr of test.extract) {
        if (!instr.path) continue;
        
        // Reusing the robust custom JSONPath resolver
        const rawValue = this.resolveJsonPath(body, instr.path);
        
        if (rawValue !== undefined) {
          // Context validation and type transformation
          context.set(instr.as, rawValue, instr.transform);
          extractedData[instr.as] = context.get(instr.as); 
          console.log(`[API Extractor] Captured "${instr.as}" =`, extractedData[instr.as]);
        } else {
          console.warn(`[API Extractor] Path '${instr.path}' returned undefined. Cannot extract into '${instr.as}'.`);
        }
      }
    }

    // 9. Render Verdict
    const passed = assertionErrors.length === 0;

    return {
      passed,
      status_code,
      durationMs: Math.round(durationMs),
      body,
      headers: responseHeaders,
      url,
      assertionErrors,
      extracted: extractedData, // Added to output payload for visibility
      audit                     // Added to pass the transparent ledger to the TestExecutor
    };
  }
}