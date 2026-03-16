import { JSONPath } from 'jsonpath-plus';

export interface ExtractInstruction {
  as: string;         // Variable name (e.g., "newUserId")
  path?: string;      // JSONPath for API (e.g., "$.id")
  property?: string;  // DOM property for UI (e.g., "innerText")
  attribute?: string; // DOM attribute for UI (e.g., "href")
  transform?: 'number' | 'string' | 'boolean'; // Optional type casting
}

export interface ApiStep {
  name: string;
  type: 'API';
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  body?: any;
  extract?: ExtractInstruction[];
}

export interface UiStep {
  name: string;
  type: 'UI';
  action: 'click' | 'fill' | 'getText' | 'navigate';
  selector?: string;
  value?: string;
  extract?: ExtractInstruction[];
}

export type TestStep = ApiStep | UiStep;