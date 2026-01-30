import test from 'node:test';
import assert from 'node:assert';
import { parseTarget } from '../../src/core/locators/target';
import { InvalidTargetError } from '../../src/core/locators/errors';

test('parseTarget parses valid target', () => {
  const parsed = parseTarget('login.username.input');

  assert.deepStrictEqual(parsed, {
    context: 'login',
    logicalName: 'username',
    type: 'input',
    elementKey: 'username.input'
  });
});

test('parseTarget rejects malformed target', () => {
  assert.throws(
    () => parseTarget('username.input'),
    (err) => err instanceof InvalidTargetError
  );

  assert.throws(
    () => parseTarget('a.b.c.d'),
    (err) => err instanceof InvalidTargetError
  );
});
