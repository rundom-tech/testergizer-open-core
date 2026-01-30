import type {
  LocatorDefinition,
  LocatorResolutionResult,
  ParsedTarget,
  ResolutionAttempt,
  StrategyExecutor
} from './types';
import {
  ContextNotAllowedError,
  NoStrategyResolvedError,
  UnknownElementKeyError
} from './errors';

export function assertContextAllowed(context: string, elementKey: string, def: LocatorDefinition): void {
  if (!def.contexts.includes(context)) {
    throw new ContextNotAllowedError(context, elementKey, def.contexts);
  }
}

export function requireDefinition(
  elementKey: string,
  def: LocatorDefinition | undefined,
  knownKeys?: string[]
): LocatorDefinition {
  if (!def) throw new UnknownElementKeyError(elementKey, knownKeys);
  return def;
}

export async function resolveLocator<THandle>(
  parsed: ParsedTarget,
  def: LocatorDefinition,
  executor: StrategyExecutor<THandle>
): Promise<{ handle: THandle; result: LocatorResolutionResult }> {
  const attempts: ResolutionAttempt[] = [];

  for (const s of def.strategies) {
    try {
      const handle = await executor.tryResolve(s);

      if (handle) {
        attempts.push({ by: s.by, value: s.value, name: s.name, result: 'success' });
        return {
          handle,
          result: {
            resolved: true,
            resolvedBy: s,
            attempts
          }
        };
      }

      attempts.push({ by: s.by, value: s.value, name: s.name, result: 'not_found' });
    } catch (err: any) {
      attempts.push({
        by: s.by,
        value: s.value,
        name: s.name,
        result: 'error',
        errorMessage: err?.message ? String(err.message) : String(err)
      });
    }
  }

  throw new NoStrategyResolvedError(parsed.context, `${parsed.context}.${parsed.logicalName}.${parsed.type}`);
}
