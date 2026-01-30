import test from 'node:test';
import assert from 'node:assert';
import { resolveLocator } from '../../src/core/locators/resolver';
import type { StrategyExecutor } from '../../src/core/locators/types';

const executor: StrategyExecutor<string> = {
  async tryResolve(strategy) {
    if (strategy.value === 'good') return 'HANDLE';
    return null;
  }
};

test('resolver stops at first successful strategy', async () => {
  const def = {
    contexts: ['login'],
    strategies: [
      { by: 'css', value: 'bad' },
      { by: 'css', value: 'good' },
      { by: 'css', value: 'never' }
    ]
  };

  const parsed = {
    context: 'login',
    logicalName: 'submit',
    type: 'button',
    elementKey: 'submit.button'
  };

  const { handle, result } = await resolveLocator(parsed, def, executor);

  assert.strictEqual(handle, 'HANDLE');
  assert.strictEqual(result.attempts.length, 2);
  assert.strictEqual(result.attempts[1].result, 'success');
});
