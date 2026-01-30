import { InvalidTargetError } from './errors';
import type { ParsedTarget } from './types';

export function parseTarget(target: string): ParsedTarget {
  const parts = target.split('.');
  if (parts.length !== 3) throw new InvalidTargetError(target);

  const [context, logicalName, type] = parts;

  if (!context || !logicalName || !type) throw new InvalidTargetError(target);

  return {
    context,
    logicalName,
    type,
    elementKey: `${logicalName}.${type}`
  };
}
