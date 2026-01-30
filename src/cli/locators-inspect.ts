#!/usr/bin/env node
import { LocatorRepository } from '../core/locators/repository';

function printUsage(): void {
  console.log(`Usage:
  testergizer locators inspect <elementKey>
  testergizer locators inspect --context <context>
`);
}

async function inspectByKey(repo: LocatorRepository, key: string): Promise<void> {
  const def = repo.get(key);

  if (!def) {
    console.error(`✖ Unknown element key "${key}"`);
    process.exit(1);
  }

  console.log(`Element key: ${key}\n`);

  console.log(`Contexts:`);
  for (const c of def.contexts) {
    console.log(`  - ${c}`);
  }

  console.log(`\nStrategies (in order):`);
  def.strategies.forEach((s, i) => {
    const extra = s.name ? ` name="${s.name}"` : '';
    console.log(`  ${i + 1}. ${s.by}: ${s.value}${extra}`);
  });
}

async function inspectByContext(repo: LocatorRepository, context: string): Promise<void> {
  const keys = repo.keys();
  const matches = keys.filter((k) => {
    const def = repo.get(k);
    return def?.contexts.includes(context);
  });

  console.log(`Context: ${context}\n`);

  if (matches.length === 0) {
    console.log(`(no elements declared for this context)`);
    return;
  }

  console.log(`Elements:`);
  for (const k of matches.sort()) {
    console.log(`  - ${k}`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    printUsage();
    process.exit(2);
  }

  const locatorsPath = process.env.TESTERGIZER_LOCATORS || 'locators.json';
  const repo = await LocatorRepository.fromFile(locatorsPath);

  if (args[1] === '--context') {
    const context = args[2];
    if (!context) {
      printUsage();
      process.exit(2);
    }
    await inspectByContext(repo, context);
    return;
  }

  const elementKey = args[1];
  await inspectByKey(repo, elementKey);
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
