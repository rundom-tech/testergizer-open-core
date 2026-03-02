import { ApiExecutable } from "../api/types";
import { ApiTargetRegistry } from "../api/ApiRepository";

export class ApiExecutor {
  private registry: ApiTargetRegistry;

  constructor(registry: ApiTargetRegistry) {
    this.registry = registry;
  }

  /**
   * Executes the API test definition against the resolved CTR target.
   */
  public async execute(test: ApiExecutable, variables: Record<string, string> = {}): Promise<any> {
    // 1. Resolve the target endpoint from the CTR
    const target = this.registry.getEndpoint(test.targetRef);
    if (!target) {
      throw new Error(`[API Executor] TargetRef '${test.targetRef}' not found in the CTR.`);
    }

    // 2. Data Variance: Inject variables into the URL (e.g., {{userId}})
    const url = this.injectVariables(target.url, variables);

    // 3. Execution Merge: Test definition trumps CTR default method
    const method = test.method || target.defaultMethod || 'GET';
    const headers = { ...target.headers }; 

    console.log(`[API] Dispatching ${method} -> ${url}`);

    // 4. The Fetch Action
    const response = await fetch(url, {
      method,
      headers,
      body: test.payload ? JSON.stringify(test.payload) : undefined
    });

    // 5. Package the result for the Assertion Engine
    const status_code = response.status;
    
    let body = {};
    const rawText = await response.text();
    try {
      body = JSON.parse(rawText);
    } catch {
      body = { text: rawText };
    }

    return {
      status_code,
      body,
      url 
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