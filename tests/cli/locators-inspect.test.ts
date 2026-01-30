import test from 'node:test';
import assert from 'node:assert';
import { writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

test('locators inspect by key prints element info', async () => {
  const locatorsPath = './tmp/locators.json';

  await writeFile(
    locatorsPath,
    JSON.stringify(
      {
        'submit.button': {
          contexts: ['login'],
          strategies: [{ by: 'css', value: 'button' }]
        }
      },
      null,
      2
    )
  );

  const { stdout } = await exec('node', [
    './src/cli/locators-inspect.ts',
    'inspect',
    'submit.button'
  ], {
    env: { ...process.env, TESTERGIZER_LOCATORS: locatorsPath }
  });

  assert.match(stdout, /submit.button/);
  assert.match(stdout, /login/);
});
