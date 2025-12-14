import fs from "fs";
import path from "path";
import { runSuiteFromFile, RunnerOptions } from "../core/runner";
import { validateSuite } from "../core/validateSuite";
import { validateResults } from "../core/validateResults";
import { diffResults, writeDiff } from "../tools/diff";
import { detectFlaky, writeFlaky } from "../tools/flaky";

function printUsage() {
  console.log(`
Testergizer — AI-assisted test execution engine

Usage:
  testergizer <command> [args] [options]

Commands:
  run <suite.json>                           Run a Testergizer suite
  validate <file.json>                      Validate a suite or results file
  diff <resultsA.json> <resultsB.json>      Diff two results files
  flaky <fileOrDir>                         Detect flaky tests/steps

Run options:
  --headed
  --slow-mo <ms>
  --browser <name>
  --screenshot-on-fail

Retry options:
  --step-retries <n>
  --retry-steps <id1,id2,...>
  --retry-step-ids <id1,id2,...>
  --retry-delay-ms <ms>
`);
}

export function cli() {
  const [, , cmd, ...args] = process.argv;

  if (!cmd) {
    printUsage();
    process.exit(1);
  }

  if (cmd === "run") {
    const suitePath = args[0];
    if (!suitePath) {
      console.error("Missing suite path");
      process.exit(1);
    }

    const opts: RunnerOptions = {
      headed: args.includes("--headed"),
      headless: args.includes("--headless"),
    };

    const slowMoIdx = args.indexOf("--slow-mo");
    if (slowMoIdx >= 0) opts.slowMo = Number(args[slowMoIdx + 1]);

    const browserIdx = args.indexOf("--browser");
    if (browserIdx >= 0) opts.browser = args[browserIdx + 1];

    const retriesIdx = args.indexOf("--step-retries");
    if (retriesIdx >= 0) opts.stepRetries = Number(args[retriesIdx + 1]);

    const retryStepsIdx = args.indexOf("--retry-steps");
    if (retryStepsIdx >= 0) {
      opts.retrySteps = args[retryStepsIdx + 1].split(",");
    }

    const retryStepIdsIdx = args.indexOf("--retry-step-ids");
    if (retryStepIdsIdx >= 0) {
      opts.retryStepIds = args[retryStepIdsIdx + 1].split(",");
    }

    const retryDelayIdx = args.indexOf("--retry-delay-ms");
    if (retryDelayIdx >= 0) {
      opts.retryDelayMs = Number(args[retryDelayIdx + 1]);
    }

    runSuiteFromFile(suitePath, opts).catch(err => {
      console.error(err);
      process.exit(1);
    });

    return;
  }

  if (cmd === "validate") {
    const filePath = args[0];
    if (!filePath) {
      console.error("Missing file path");
      process.exit(1);
    }

    let ok = true;
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const json = JSON.parse(raw);

      if (json.tests && json.summary) {
        validateResults(json); // throws on failure
      } else {
        validateSuite(json);   // throws on failure
      }
    } catch (err) {
      ok = false;
      console.error(err instanceof Error ? err.message : err);
    }

    process.exit(ok ? 0 : 1);
  }

  if (cmd === "diff") {
    const [a, b] = args;
    if (!a || !b) {
      console.error("Missing results files");
      process.exit(1);
    }
    const diff = diffResults(a, b);
    writeDiff(diff);
    return;
  }

  if (cmd === "flaky") {
    const target = args[0];
    if (!target) {
      console.error("Missing path");
      process.exit(1);
    }
    const flaky = detectFlaky(target);
    writeFlaky(flaky);
    return;
  }

  printUsage();
  process.exit(1);
}

cli();
