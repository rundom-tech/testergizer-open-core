import type { LocatorDefinition, ClrSelector } from "./types";

export function validateLocatorDefinition(
  raw: unknown,
  path: string
): LocatorDefinition {
  if (!raw || typeof raw !== "object") {
    throw new Error(`Invalid locator definition at '${path}'.`);
  }

  const obj = raw as Record<string, unknown>;

  // strategy (optional)
  let strategy: "firstMatch" | undefined;

  if (obj.strategy !== undefined) {
    if (obj.strategy !== "firstMatch") {
      throw new Error(
        `Invalid strategy at '${path}'. Only "firstMatch" is supported.`
      );
    }
    strategy = obj.strategy;
  }

  // contexts (optional)
  let contexts: string[] | undefined;

  if (obj.contexts !== undefined) {
    if (!Array.isArray(obj.contexts)) {
      throw new Error(`'contexts' at '${path}' must be an array of strings.`);
    }

    contexts = obj.contexts.map((c, i) => {
      if (typeof c !== "string") {
        throw new Error(
          `contexts[${i}] at '${path}' must be a string.`
        );
      }
      return c;
    });
  }

  // selectors (required)
  if (!Array.isArray(obj.selectors) || obj.selectors.length === 0) {
    throw new Error(
      `Locator '${path}' must define a non-empty 'selectors' array.`
    );
  }

  const selectors: ClrSelector[] = obj.selectors.map((s, i) => {
    if (!s || typeof s !== "object") {
      throw new Error(
        `Invalid selector at '${path}.selectors[${i}]'.`
      );
    }

    const sel = s as Record<string, unknown>;

    if (typeof sel.using !== "string") {
      throw new Error(
        `Selector at '${path}.selectors[${i}]' must define a string 'using'.`
      );
    }

    if (typeof sel.value !== "string") {
      throw new Error(
        `Selector at '${path}.selectors[${i}]' must define a string 'value'.`
      );
    }

    return {
      using: sel.using as ClrSelector["using"],
      value: sel.value
    };
  });

  return {
    strategy,
    contexts,
    selectors
  };
}

export function validateLocatorDictionary(
  raw: unknown
): Record<string, LocatorDefinition> {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid CLR locator dictionary.");
  }

  const result: Record<string, LocatorDefinition> = {};
  const obj = raw as Record<string, unknown>;

  for (const key of Object.keys(obj)) {
    result[key] = validateLocatorDefinition(obj[key], key);
  }

  return result;
}