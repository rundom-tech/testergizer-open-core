import { readFile } from 'node:fs/promises';
import type { LocatorDictionary, LocatorDefinition } from './types';
import { validateLocatorDictionary } from './validate';

export class LocatorRepository {
  private readonly dict: LocatorDictionary;

  private constructor(dict: LocatorDictionary) {
    this.dict = dict;
  }

  static async fromFile(jsonPath: string): Promise<LocatorRepository> {
    const rawText = await readFile(jsonPath, 'utf-8');
    const rawJson = JSON.parse(rawText) as unknown;
    const dict = validateLocatorDictionary(rawJson);
    return new LocatorRepository(dict);
  }

  // ✅ NEW: allow suite-level injected CTR
  static fromDictionary(raw: unknown): LocatorRepository {
    const dict = validateLocatorDictionary(raw);
    return new LocatorRepository(dict);
  }

  get(elementKey: string): LocatorDefinition | undefined {
    return this.dict[elementKey];
  }

  keys(): string[] {
    return Object.keys(this.dict);
  }

  toJSON(): LocatorDictionary {
    return this.dict;
  }
}