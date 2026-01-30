#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

interface LocatorResolutionEvent {
  type: 'locatorResolution';
  target: string;
  context: string;
  elementKey: string;
  resolved: boolean;
  attempts: Array<{
    by: string;
    value: string;
    name?: string;
    result: 'success' | 'not_found' | 'error';
  }>;
}

async function inspectEvidence(path: string, target?: string): Promise<void> {
  const rl = createInterface({
    input: createReadStream(path),
    crlfDelay: Infinity
  });

  let seen = 0;
  const resolutionCounts = new Map<string, number>();

  for await (const line of rl) {
    if (!line.trim()) continue;

    let evt: any;
    try {
      evt = JSON.parse(line);
    } catch {
      continue;
    }

    if (evt.type !== 'locatorResolution') continue;
    if (target && evt.target !== target) continue;

    const e = evt as LocatorResolutionEvent;
    seen++;

    for (const a of e.attempts) {
      if (a.result === 'success') {
        const key = `${a.by}:${a.value}${a.name ? `:${a.name}` : ''}`;
        resolutionCounts.set(key, (resolutionCounts.get(key) ?? 0) + 1);
      }
    }
  }

  if (target) {
    console.log(`Target: ${target}`);
  }

  console.log(`\nSeen ${seen} resolution events\n`);

  if (resolutionCounts.size === 0) {
    console.log(`(no successful resolutions found)`);
    return;
  }

  console.log(`Resolved by:`);
  for (const [k, v] of resolutionCounts.entries()) {
    console.log(`  - ${k}: ${v} time(s)`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log(`Usage:
  testergizer evidence inspect <evidence.jsonl> [--target <target>]
`);
    process.exit(2);
  }

  const path = args[0];
  let target: string | undefined;

  if (args[1] === '--target') {
    target = args[2];
  }

  await inspectEvidence(path, target);
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
