export interface ApiDefinition {
  baseUrl: string;
  endpoints: Record<string, string>;
}

export class ApiRepository {
  private readonly baseUrl: string;
  private readonly endpoints: Record<string, string>;

  constructor(definition: ApiDefinition) {
    if (!definition || typeof definition !== "object") {
      throw new Error("Invalid apiDefinition: object expected.");
    }

    if (!definition.baseUrl || typeof definition.baseUrl !== "string") {
      throw new Error("apiDefinition.baseUrl must be a non-empty string.");
    }

    if (!definition.endpoints || typeof definition.endpoints !== "object") {
      throw new Error("apiDefinition.endpoints must be an object.");
    }

    this.baseUrl = definition.baseUrl;
    this.endpoints = definition.endpoints;
  }

  resolve(endpointKey: string): string {
    const path = this.endpoints[endpointKey];

    if (!path) {
      const available = Object.keys(this.endpoints).join(", ");
      throw new Error(
        `API endpoint "${endpointKey}" not found. Available keys: ${available}`
      );
    }

    return this.baseUrl.replace(/\/$/, "") + "/" + path.replace(/^\//, "");
  }

  keys(): string[] {
    return Object.keys(this.endpoints);
  }
}