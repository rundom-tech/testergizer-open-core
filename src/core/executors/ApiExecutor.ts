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
   * Supports standard dot notation ($.name) and array indices ($[0].userId).
   */
  private resolveJsonPath(payload: any, path: string): any {
    if (!path) return undefined;
    
    // 1. Strip the root '$' if present
    let normalized = path.startsWith('$') ? path.substring(1) : path;
    
    // 2. Strip leading dot if it exists (e.g., '$.name' became '.name')
    if (normalized.startsWith('.')) {
      normalized = normalized.substring(1);
    }

    // 3. Convert array brackets to dot notation (e.g., '[0].userId' -> '0.userId')
    normalized = normalized.replace(/\[(\d+)\]/g, '.$1');

    // 4. Handle edge case of leading dot after bracket replacement (e.g., '$[0]' -> '.0')
    if (normalized.startsWith('.')) {
      normalized = normalized.substring(1);
    }

    // If the path was just '$', return the whole payload
    if (!normalized) return payload;

    // 5. Traverse the object safely
    return normalized.split('.').reduce((acc, part) => {
      return acc !== undefined && acc !== null ? acc[part] : undefined;
    }, payload);
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
    const payload = test.payload ? resolver.resolveObject(test.payload) : undefined;

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

    // 7. The Assertion Engine (The Judge)
    const assertionErrors: string[] = [];

    if (test.assertions && test.assertions.length > 0) {
      for (const assertion of test.assertions) {
        switch (assertion.check) {
          
          case 'status_code':
            if (status_code !== assertion.expected) {
              assertionErrors.push(`[status_code] Expected ${assertion.expected}, got ${status_code}`);
            }
            break;

          case 'json_path':
            if (!assertion.path) {
              assertionErrors.push(`[json_path] Missing 'path' property for assertion.`);
              break;
            }

            // USE THE ROBUST NORMALIZER INSTEAD OF THE LIGHTWEIGHT SPLIT
            const actualValue = this.resolveJsonPath(body, assertion.path);

            // Using JSON.stringify for safe comparison of objects/arrays vs primitives
            if (JSON.stringify(actualValue) !== JSON.stringify(assertion.expected)) {
              // Ensure undefined is clearly reported instead of vanishing
              const displayActual = actualValue === undefined ? "undefined" : JSON.stringify(actualValue);
              const displayExpected = JSON.stringify(assertion.expected);
              assertionErrors.push(`[json_path] Path '${assertion.path}' mismatch. Expected: ${displayExpected}, Actual: ${displayActual}`);
            }
            break;

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
      extracted: extractedData // Added to output payload for visibility
    };
  }
}