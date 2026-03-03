import { ApiExecutable, ApiAssertion } from "../api/types";
import { ApiTargetRegistry } from "../api/ApiRepository";

export class ApiExecutor {
  private registry: ApiTargetRegistry;

  constructor(registry: ApiTargetRegistry) {
    this.registry = registry;
  }

  /**
   * Executes the API test definition, evaluates assertions, and acts as the judge.
   */
  public async execute(test: ApiExecutable, variables: Record<string, string> = {}): Promise<any> {
    // 1. Resolve target
    const target = this.registry.getEndpoint(test.targetRef);
    if (!target) {
      throw new Error(`[API Executor] TargetRef '${test.targetRef}' not found in the CTR.`);
    }

    // 2. Data Variance
    const url = this.injectVariables(target.url, variables);
    const method = test.method || target.defaultMethod || 'GET';
    const headers = { ...target.headers }; 

    console.log(`[API] Dispatching ${method} -> ${url}`);

    // 3. The Fetch Action & Timing
    const startTime = performance.now();
    const response = await fetch(url, {
      method,
      headers,
      body: test.payload ? JSON.stringify(test.payload) : undefined
    });
    const durationMs = performance.now() - startTime;

    // 4. Package Live Data
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

    // 5. The Assertion Engine (The Judge)
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

            // Lightweight dot-notation evaluator (strips leading "$." if present)
            const cleanPath = assertion.path.startsWith('$.') 
              ? assertion.path.slice(2) 
              : assertion.path;
            
            const actualValue = cleanPath.split('.').reduce((acc, part) => acc && acc[part], body);

            // Using JSON.stringify for safe comparison of objects/arrays vs primitives
            if (JSON.stringify(actualValue) !== JSON.stringify(assertion.expected)) {
              assertionErrors.push(`[json_path] Path '${assertion.path}' mismatch. Expected: ${JSON.stringify(assertion.expected)}, Actual: ${JSON.stringify(actualValue)}`);
            }
            break;

          default:
            assertionErrors.push(`[UNKNOWN_ASSERTION] The check '${(assertion as any).check}' is not supported.`);
        }
      }
    }

    // 6. Render Verdict
    const passed = assertionErrors.length === 0;

    return {
      passed,
      status_code,
      durationMs: Math.round(durationMs),
      body,
      headers: responseHeaders,
      url,
      assertionErrors 
    };
  }

  /**
   * Replaces {{variableName}} in strings with the provided variance data.
   */
  private injectVariables(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
      const cleanKey = key.trim();
      return variables[cleanKey] !== undefined ? variables[cleanKey] : `{{${cleanKey}}}`;
    });
  }
}