export interface ApiTargetDefinition {
  url: string;
  defaultMethod?: string;
  headers?: Record<string, string>;
  [key: string]: any;
}

export class ApiTargetRegistry {
  private endpointsMap: Map<string, ApiTargetDefinition> = new Map();

  /**
   * Loads ONLY API endpoints from an injected CTR document.
   * UI locators are strictly ignored to preserve domain boundaries.
   */
  public loadFromObject(doc: any): void {
    // 1. Guard against empty docs or docs without endpoints (like UI CTRs)
    if (!doc || !doc.endpoints) {
      return; 
    }
    
    // 2. Map the endpoints directly to our internal memory using the exact target keys
    for (const [key, val] of Object.entries(doc.endpoints)) {
      this.endpointsMap.set(key, val as ApiTargetDefinition);
    }
    
    // Quality Intelligence: Silence empty domain boundaries to avoid terminal spam
    if (this.endpointsMap.size > 0) {
      console.log(`[API] Loaded ${this.endpointsMap.size} REST targets. Boundaries secured.`);
    }
  }

  /**
   * Retrieves an API endpoint definition by its target reference ID.
   */
  public getEndpoint(targetRef: string): ApiTargetDefinition | undefined {
    return this.endpointsMap.get(targetRef);
  }
}