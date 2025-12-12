import { runSuiteFromFile, RunnerOptions } from "../core/runner";

/**
 * CLI entry point.
 *
 * Usage:
 *   testergizer run <suite.json> [--headed] [--slow-mo <ms>] [--browser <name>] [--screenshot-on-fail]
 */
export async function cli() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printHelp();
    process.exit(1);
  }

  const command = args[0];

  switch (command) {
    case "run": {
      const suitePath = args.find(arg => arg !== "run" && !arg.startsWith("-"));

      if (!suitePath) {
        console.error("Error: missing test suite path");
        printHelp();
        process.exit(1);
      }

      const options = parseRunOptions(args);
      const ok = await runSuiteFromFile(suitePath, options);
      process.exit(ok ? 0 : 1);
    }

    case "--help":
    case "-h":
    case "help":
      printHelp();
      process.exit(0);

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

function parseRunOptions(args: string[]): RunnerOptions {
  const headed = args.includes("--headed");

  const slowMoIndex = args.indexOf("--slow-mo");
  const slowMo =
    slowMoIndex !== -1 && args[slowMoIndex + 1] ? Number(args[slowMoIndex + 1]) : undefined;

  const browserIndex = args.indexOf("--browser");
  const browserRaw =
    browserIndex !== -1 && args[browserIndex + 1] ? String(args[browserIndex + 1]) : "chromium";
  const browser =
    browserRaw === "firefox" || browserRaw === "webkit" || browserRaw === "chromium"
      ? browserRaw
      : "chromium";

  const screenshotOnFail = args.includes("--screenshot-on-fail");

  return {
    headless: !headed,
    slowMo: Number.isFinite(slowMo) ? slowMo : undefined,
    browser: browser as RunnerOptions["browser"],
    screenshotOnFail
  };
}

function printHelp() {
  console.log(`
Testergizer — AI-assisted test execution engine

Usage:
  testergizer run <suite.json> [options]

Options:
  --headed                 Run browser in headed (UI) mode
  --slow-mo <ms>           Slow down actions by <ms> (debug)
  --browser <name>         chromium | firefox | webkit (default: chromium)
  --screenshot-on-fail     Capture a screenshot on failure into ./artifacts/
  -h, --help               Show this help message

Examples:
  testergizer run tests/login.json
  testergizer run tests/login.json --headed
  testergizer run tests/login.json --headed --slow-mo 200
  testergizer run tests/login.json --browser firefox
  testergizer run tests/login.json --screenshot-on-fail
`);
}

// Execute CLI
cli().catch(err => {
  console.error(err);
  process.exit(1);
});
