import test from 'node:test';
import assert from 'node:assert';
import { readFile } from 'node:fs/promises';
import { JsonlEvidenceSink } from '../../src/core/evidence/jsonlSink';

test('JSONL sink appends evidence as one line', async () => {
  const path = './tmp/test-evidence.jsonl';
  const sink = new JsonlEvidenceSink(path);

  await sink.append({
    type: 'locatorResolution',
    timestamp: '2026-01-29T00:00:00.000Z',
    target: 'login.submit.button',
    context: 'login',
    elementKey: 'submit.button',
    resolved: true,
    attempts: []
  });

  const content = await readFile(path, 'utf-8');
  const lines = content.trim().split('\n');

  assert.strictEqual(lines.length, 1);

  const parsed = JSON.parse(lines[0]);
  assert.strictEqual(parsed.target, 'login.submit.button');
});
