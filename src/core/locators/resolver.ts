import type {
  LocatorDefinition,
  ClrSelector,
  LocatorResolutionResult
} from "./types";

import { ContextNotAllowedError } from "./errors";

export async function resolveLocator(
  elementKey: string,
  def: LocatorDefinition,
  context: string,
  executor: {
    tryResolve(selector: ClrSelector): Promise<unknown | null>;
  }
): Promise<LocatorResolutionResult> {
  // Context guard (optional)
  if (def.contexts && !def.contexts.includes(context)) {
    throw new ContextNotAllowedError(
      context,
      elementKey,
      def.contexts ?? []
    );
  }

  const attempts: Array<{
    using: ClrSelector["using"];
    value: string;
    result: "success" | "not_found";
  }> = [];

  for (const s of def.selectors) {
    const handle = await executor.tryResolve(s);

    if (handle) {
      attempts.push({
        using: s.using,
        value: s.value,
        result: "success"
      });

      return {
        resolved: true,
        resolvedBy: s,
        handle,
        attempts
      };
    }

    attempts.push({
      using: s.using,
      value: s.value,
      result: "not_found"
    });
  }

  return {
    resolved: false,
    attempts
  };
}