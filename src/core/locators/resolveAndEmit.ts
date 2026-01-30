import type { EvidenceSink } from '../evidence/types';
import type { StrategyExecutor } from './types';
import { parseTarget } from './target';
import { LocatorRepository } from './repository';
import { assertContextAllowed, requireDefinition, resolveLocator } from './resolver';

function nowIso(): string {
  return new Date().toISOString();
}

export async function resolveTargetWithEvidence<THandle>(args: {
  target: string;               // "login.submit.button"
  repo: LocatorRepository;
  executor: StrategyExecutor<THandle>;
  evidence?: EvidenceSink;      // optional in Core (but recommended)
}): Promise<THandle> {
  const parsed = parseTarget(args.target);
  const elementKey = parsed.elementKey;

  const def = requireDefinition(elementKey, args.repo.get(elementKey), args.repo.keys());
  assertContextAllowed(parsed.context, elementKey, def);

  try {
    const { handle, result } = await resolveLocator(parsed, def, args.executor);

    await args.evidence?.append({
      type: 'locatorResolution',
      timestamp: nowIso(),
      target: args.target,
      context: parsed.context,
      elementKey,
      resolved: true,
      attempts: result.attempts,
      resolvedBy: result.resolvedBy
        ? { by: result.resolvedBy.by, value: result.resolvedBy.value, ...(result.resolvedBy.name ? { name: result.resolvedBy.name } : {}) }
        : undefined
    });

    return handle;
  } catch (err: any) {
    // Emit failure evidence as well
    await args.evidence?.append({
      type: 'locatorResolution',
      timestamp: nowIso(),
      target: args.target,
      context: parsed.context,
      elementKey,
      resolved: false,
      attempts: [] // attempts are inside the thrown error path; keep Core simple here
    });

    throw err;
  }
}
