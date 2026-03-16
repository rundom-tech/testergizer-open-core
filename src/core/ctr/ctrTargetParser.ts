import { InvalidTargetError } from './ctrErrors';
import type { ParsedTarget } from './ctrTypes';

export function parseTarget(target: string): ParsedTarget {
  const parts = target.split('.');

  // Support for 2-part global targets (e.g. "input.username")
  if (parts.length === 2) {
    return {
      context: "global",
      logicalName: parts[0],
      type: parts[1],
      elementKey: target
    };
  }

  // Support for 3-part contextual targets (e.g. "login.input.username")
  if (parts.length === 3) {
    const [context, logicalName, type] = parts;
    return {
      context,
      logicalName,
      type,
      elementKey: `${logicalName}.${type}`
    };
  }

  throw new InvalidTargetError(target);
}