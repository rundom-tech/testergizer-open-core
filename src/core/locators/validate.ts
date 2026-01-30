import type { LocatorDictionary, LocatorDefinition, LocatorStrategy } from './types';
import { LocatorsError } from './errors';

function isNonEmptyString(x: unknown): x is string {
  return typeof x === 'string' && x.trim().length > 0;
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every(isNonEmptyString);
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function validateStrategy(raw: unknown, path: string): LocatorStrategy {
  if (!isObject(raw)) throw new LocatorsError('INVALID_LOCATORS', `Invalid strategy at ${path}: expected object`);

  const by = raw.by;
  const value = raw.value;
  const name = raw.name;

  const knownBy = ['css', 'xpath', 'testId', 'role', 'text', 'aria'] as const;

  if (!isNonEmptyString(by) || !knownBy.includes(by as any)) {
    throw new LocatorsError('INVALID_LOCATORS', `Invalid "by" at ${path}.by: must be one of ${knownBy.join(', ')}`);
  }
  if (!isNonEmptyString(value)) {
    throw new LocatorsError('INVALID_LOCATORS', `Invalid "value" at ${path}.value: must be non-empty string`);
  }
  if (name !== undefined && !isNonEmptyString(name)) {
    throw new LocatorsError('INVALID_LOCATORS', `Invalid "name" at ${path}.name: must be non-empty string if provided`);
  }

  return { by: by as any, value, ...(name ? { name } : {}) };
}

export function validateLocatorDefinition(raw: unknown, path: string): LocatorDefinition {
  if (!isObject(raw)) throw new LocatorsError('INVALID_LOCATORS', `Invalid locator definition at ${path}: expected object`);

  const contexts = raw.contexts;
  const strategies = raw.strategies;
  const description = raw.description;

  if (!isStringArray(contexts) || contexts.length === 0) {
    throw new LocatorsError('INVALID_LOCATORS', `Invalid "contexts" at ${path}.contexts: must be non-empty string array`);
  }

  if (!Array.isArray(strategies) || strategies.length === 0) {
    throw new LocatorsError('INVALID_LOCATORS', `Invalid "strategies" at ${path}.strategies: must be non-empty array`);
  }

  const parsedStrategies = strategies.map((s, i) => validateStrategy(s, `${path}.strategies[${i}]`));

  if (description !== undefined && !isNonEmptyString(description)) {
    throw new LocatorsError('INVALID_LOCATORS', `Invalid "description" at ${path}.description: must be non-empty string`);
  }

  return {
    contexts,
    strategies: parsedStrategies,
    ...(description ? { description } : {})
  };
}

export function validateLocatorDictionary(raw: unknown): LocatorDictionary {
  if (!isObject(raw)) throw new LocatorsError('INVALID_LOCATORS', `Invalid locators JSON: expected object at root`);

  const out: LocatorDictionary = {};

  for (const [key, def] of Object.entries(raw)) {
    if (!isNonEmptyString(key) || !key.includes('.')) {
      throw new LocatorsError(
        'INVALID_LOCATORS',
        `Invalid dictionary key "${key}". Expected "<logicalName>.<type>" (e.g. "submit.button")`
      );
    }
    out[key] = validateLocatorDefinition(def, `locators["${key}"]`);
  }

  return out;
}
