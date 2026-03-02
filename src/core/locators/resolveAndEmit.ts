import type { EvidenceSink } from '../evidence/types';
import type { StrategyExecutor } from './types';
import { parseTarget } from './target';
import { LocatorRepository } from './repository';
import { resolveLocator } from './resolver';

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
  const elementKey = parsed.elementKey;   // CTR logical key
  const context = parsed.context;

  const def = args.repo.get(elementKey);

  if (!def) {
    throw new Error(
      `CTR element "${elementKey}" not found. Available keys: ${args.repo.keys().join(', ')}`
    );
  }

  try {
    const res = await resolveLocator(
      elementKey,
      def,
      context,
      args.executor
    );

    if (!res.resolved || !res.handle) {
      throw new Error(`Failed to resolve locator: ${args.target}`);
    }

    // Emit full resolution evidence for report layer
    await args.evidence?.append({
      type: 'locatorResolution',
      timestamp: nowIso(),

      // semantic identity
      target: args.target,
      context,
      elementKey,                // logical key (for report primary display)

      // mechanical outcome
      resolved: true,

      attempts: res.attempts?.map(a => ({
        using: a.using,
        value: a.value,
        result: a.result
      })) ?? [],

      resolvedBy: res.resolvedBy
        ? {
            using: res.resolvedBy.using,
            value: res.resolvedBy.value
          }
        : undefined
    });

    return res.handle as THandle;

  } catch (err: any) {

    // Emit failure evidence as well
    await args.evidence?.append({
      type: 'locatorResolution',
      timestamp: nowIso(),

      target: args.target,
      context,
      elementKey,

      resolved: false,

      // if resolver threw before attempts were available,
      // keep it empty rather than guessing
      attempts: [],

      resolvedBy: undefined
    });

    throw err;
  }
}