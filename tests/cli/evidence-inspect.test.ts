import test from 'node:test';
import assert from 'node:assert';
import { writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

test('evidence inspect aggregates successful resolutions', async () => {
  const path = './tmp/evidence.jsonl';

  await writeFile(
    path,
    [
      JSON.stringify({
        type: 'locatorResolution',
        target: 'login.submit.button',
        context: 'login',
        elementKey: 'submit.button',
        resolved: true,
        attempts: [
          { by: 'css', value: 'button', result: 'success' }
        ]
      })
    ].join('\n')
  );

  const { stdout } = await exec('node', [
    './src/cli/evidence-inspect.ts',
    path
  ]);

  assert.match(stdout, /Seen 1/);
  assert.match(stdout, /css:button/);
});
