#!/usr/bin/env node
import { LocatorRepository } from '../core/locators/repository';

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: testergizer-locators-validate <path/to/locators.json>');
    process.exit(2);
  }

  const path = args[0];

  try {
    const repo = await LocatorRepository.fromFile(path);
    console.log(`✔ ${path} is valid`);
    console.log(`✔ ${repo.keys().length} element keys loaded`);
  } catch (err: any) {
    console.error(`✖ locators validation failed`);
    console.error(err?.message ? String(err.message) : String(err));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
