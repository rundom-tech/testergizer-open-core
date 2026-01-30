import test from 'node:test';
import assert from 'node:assert';
import { validateLocatorDictionary } from '../../src/core/locators/validate';
import { LocatorsError } from '../../src/core/locators/errors';

test('valid locator dictionary passes', () => {
  const dict = validateLocatorDictionary({
    'username.input': {
      contexts: ['login'],
      strategies: [{ by: 'testId', value: 'username-input' }]
    }
  });

  assert.ok(dict['username.input']);
});

test('locator with empty contexts fails', () => {
  assert.throws(
    () =>
      validateLocatorDictionary({
        'submit.button': {
          contexts: [],
          strategies: [{ by: 'css', value: 'button' }]
        }
      }),
    (err) => err instanceof LocatorsError
  );
});

test('locator with empty strategies fails', () => {
  assert.throws(
    () =>
      validateLocatorDictionary({
        'submit.button': {
          contexts: ['login'],
          strategies: []
        }
      }),
    (err) => err instanceof LocatorsError
  );
});
