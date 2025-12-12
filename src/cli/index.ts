import { runSuiteFromFile } from "../core/runner";

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0) return process.argv[idx + 1];
  return undefined;
}

export function cli() {
  const [, , command, suitePath] = process.argv;

  if (command !== "run" || !suitePath) {
    console.log("Usage: testergizer run <path/to/suite.json> [--parallel N] [--headed]");
    process.exit(1);
  }

  const parallel = getArg("--parallel");
  const headed = process.argv.includes("--headed");

  runSuiteFromFile(suitePath, {
    parallel: parallel ? Number(parallel) : undefined,
    headless: headed ? false : undefined
  });
}
