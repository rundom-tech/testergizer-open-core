import type {
  LocatorDefinition,
  CtrSelector,
  LocatorResolutionResult
} from "./ctrTypes";

import { ContextNotAllowedError } from "./ctrErrors";

export function resolveLocator(
  elementKey: string,
  def: LocatorDefinition,
  context?: string
): LocatorResolutionResult {
  // Context guard (optional)
  if (context && context !== "global" && def.contexts && !def.contexts.includes(context)) {
    throw new ContextNotAllowedError(
      context,
      elementKey,
      def.contexts ?? []
    );
  }

  if (!def.selectors || def.selectors.length === 0) {
    return { resolved: false, attempts: [] };
  }

  // STRICT BOUNDARY: Do not probe the DOM. 
  // Extract the primary selector and trust Playwright's auto-wait.
  const primary = def.selectors[0];

  return {
    resolved: true,
    resolvedBy: primary,
    attempts: [{
      using: primary.using,
      value: primary.value,
      result: "success"
    }]
  };
}