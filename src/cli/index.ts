import fs from "fs";
import path from "path";
import { runSuiteFromFile, RunnerOptions } from "../core/runner";
import { validateSuite } from "../core/validateSuite";
import { validateResults } from "../core/validateResults";
import { diffResults, writeDiff } from "../tools/diff";
import { detectFlaky } from "../tools/flaky";
import { resolveInputFiles } from "./resolveInputs";

function printUsage() {
  console.log(`
Testergizer — AI-assisted test execution engine

Usage:
  testergizer <command> [args] [options]

Commands:
  run <suite.json>                           Run a Testergizer suite
  validate <file.json>                      Validate a suite or results file
  diff <resultsA.json> <resultsB.json>      Diff two results files
  flaky <fileOrDir> [more...]               Detect flaky tests/steps

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

export async function cli() {
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
  if (args.length === 0) {
    console.error("Missing file path");
    process.exit(1);
  }

  let ok = true;

  try {
  const files = await resolveInputFiles(args);

  for (const filePath of files) {
    const raw = fs.readFileSync(filePath, "utf-8");
    const json = JSON.parse(raw);

    if (json.tests && json.summary) {
      validateResults(json);
    } else {
      validateSuite(json);
    }
  }

  console.log(`✔ Validated ${files.length} file(s) successfully`);
} catch (err) {
  ok = false;
  console.error(err instanceof Error ? err.message : err);
}

  process.exit(ok ? 0 : 1);
}


  if (cmd === "diff") {
    const [a, b, ...rest] = args;
    if (!a || !b) {
      console.error("Missing results files");
      process.exit(1);
    }

    const outIdx = rest.indexOf("--out");
    const outPath =
      outIdx >= 0 ? rest[outIdx + 1] : path.join("artifacts", "diff.json");

    const diff = diffResults(a, b);
    writeDiff(outPath, diff);
    return;
  }

  if (cmd === "flaky") {
    if (args.length === 0) {
      console.error("Missing path(s)");
      process.exit(1);
    }

    const flaky = detectFlaky(args);
    const outPath = path.join("artifacts", "flaky.json");
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(flaky, null, 2), "utf-8");
    console.log(`Flaky report written to ${outPath}`);
    return;
  }

  printUsage();
  process.exit(1);
}

cli();
