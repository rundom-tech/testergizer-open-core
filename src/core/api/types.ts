// ==========================================
// PART 1: EXECUTABLE TYPES (The Test Definition)
// ==========================================

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface ApiAssertion {
  check: 'status_code' | 'json_path';
  expected: any;
  path?: string;
}

export interface ApiExecutable {
  id: string;
  version: "2.0";
  targetRef: string; // e.g., "T-USER-PROFILE" (Points to the CTR)
  method?: ApiMethod; // Optional: Overrides the defaultMethod in the CTR
  payload?: any;      // Used for POST/PUT
  assertions: ApiAssertion[];
}

// ==========================================
// PART 2: CTR TYPES (The Central Target Registry)
// ==========================================

export type CtrDomain = 'WEB' | 'REST';

export interface BaseCtrDocument {
  id: string;
  description?: string;
  domain?: CtrDomain; // Optional to prevent breaking legacy UI files
}

export interface UiCtrDocument extends BaseCtrDocument {
  domain?: 'WEB';
  locators: Record<string, any>; 
}

export interface ApiTargetDefinition {
  url: string;
  defaultMethod?: ApiMethod;
  headers?: Record<string, string>;
}

export interface ApiCtrDocument extends BaseCtrDocument {
  domain: 'REST';
  endpoints: Record<string, ApiTargetDefinition>; 
}

export type CtrDocument = UiCtrDocument | ApiCtrDocument;

/**
 * TYPE GUARD: Safely determines if a parsed JSON file belongs to the REST domain.
 */
export function isApiCtrDocument(doc: CtrDocument): doc is ApiCtrDocument {
  return doc.domain === 'REST' || 'endpoints' in doc;
}