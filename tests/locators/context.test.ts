import test from 'node:test';
import assert from 'node:assert';
import { assertContextAllowed } from '../../src/core/locators/resolver';
import { ContextNotAllowedError } from '../../src/core/locators/errors';

test('context allowed passes', () => {
  assert.doesNotThrow(() =>
    assertContextAllowed('login', 'submit.button', {
      contexts: ['login', 'settings'],
      strategies: []
    })
  );
});

test('context mismatch throws hard error', () => {
  assert.throws(
    () =>
      assertContextAllowed('admin', 'submit.button', {
        contexts: ['login', 'settings'],
        strategies: []
      }),
    (err) => err instanceof ContextNotAllowedError
  );
});
