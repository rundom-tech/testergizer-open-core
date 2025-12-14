"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cli = cli;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const runner_1 = require("../core/runner");
const diff_1 = require("../tools/diff");
const flaky_1 = require("../tools/flaky");
/**
 * CLI entry point.
 *
 * Commands:
 *   run   Execute a suite JSON (test plan) using Playwright.
 *   diff  Compare two results.json files (by test/step IDs).
 *   flaky Detect flaky tests/steps across multiple results.json files.
 */
async function cli() {
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
            const ok = await (0, runner_1.runSuiteFromFile)(suitePath, options);
            process.exit(ok ? 0 : 1);
        }
        case "diff": {
            const a = args[1];
            const b = args[2];
            if (!a || !b) {
                console.error("Error: diff requires two results.json paths");
                printHelp();
                process.exit(1);
            }
            const out = getFlagValue(args, "--out") ?? "artifacts/diff.json";
            const diff = (0, diff_1.diffResults)(a, b);
            (0, diff_1.writeDiff)(out, diff);
            console.log(`Diff written to ${out}`);
            process.exit(0);
        }
        case "flaky": {
            const inputs = args.slice(1).filter(a => a && !a.startsWith("-"));
            if (inputs.length === 0) {
                console.error("Error: flaky requires one or more results.json files or directories");
                printHelp();
                process.exit(1);
            }
            const out = getFlagValue(args, "--out") ?? "artifacts/flaky.json";
            const files = (0, flaky_1.resolveInputs)(inputs);
            const report = (0, flaky_1.detectFlaky)(files);
            writeJson(out, report);
            console.log(`Flaky report written to ${out}`);
            process.exit(0);
        }
        case "validate": {
            const file = args[1];
            if (!file) {
                console.error("Error: validate requires a JSON file path");
                process.exit(1);
            }
            const fs = require("fs");
            const raw = fs.readFileSync(file, "utf-8");
            const json = JSON.parse(raw);
            if (file.includes("results")) {
                const { validateResults } = require("../core/validateResults");
                validateResults(json);
                console.log("✔ Results schema valid");
                process.exit(0);
            }
            if (file.includes("suite") || file.endsWith(".json")) {
                const { validateSuite } = require("../core/validateSuite");
                validateSuite(json);
                console.log("✔ Suite schema valid");
                process.exit(0);
            }
            console.error("Unknown validation target");
            process.exit(1);
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
function parseRunOptions(args) {
    const headed = args.includes("--headed");
    const screenshotOnFail = args.includes("--screenshot-on-fail");
    const slowMo = parseNumberFlag(args, "--slow-mo");
    const retryDelayMs = parseNumberFlag(args, "--retry-delay-ms");
    const stepRetries = parseNumberFlag(args, "--step-retries");
    const browser = (getFlagValue(args, "--browser") ?? "chromium");
    const browserSafe = (browser === "firefox" || browser === "webkit" || browser === "chromium") ? browser : "chromium";
    const retryStepsCsv = getFlagValue(args, "--retry-steps");
    const retryStepIds = retryStepsCsv ? retryStepsCsv.split(",").map(s => s.trim()).filter(Boolean) : [];
    return {
        headless: !headed,
        slowMo: Number.isFinite(slowMo) ? slowMo : undefined,
        browser: browserSafe,
        screenshotOnFail,
        stepRetries: Number.isFinite(stepRetries) ? stepRetries : 0,
        retryStepIds,
        retryDelayMs: Number.isFinite(retryDelayMs) ? retryDelayMs : 0
    };
}
function parseNumberFlag(args, flag) {
    const idx = args.indexOf(flag);
    if (idx === -1)
        return undefined;
    const raw = args[idx + 1];
    if (!raw)
        return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
}
function getFlagValue(args, flag) {
    const idx = args.indexOf(flag);
    if (idx === -1)
        return undefined;
    const v = args[idx + 1];
    if (!v || v.startsWith("-"))
        return undefined;
    return v;
}
function writeJson(outPath, obj) {
    const p = path_1.default.resolve(process.cwd(), outPath);
    fs_1.default.mkdirSync(path_1.default.dirname(p), { recursive: true });
    fs_1.default.writeFileSync(p, JSON.stringify(obj, null, 2), "utf-8");
}
function printHelp() {
    console.log(`
Testergizer — AI-assisted test execution engine

Usage:
  testergizer <command> [args] [options]

Commands:
  run <suite.json>                           Run a Testergizer suite (test plan)
  diff <resultsA.json> <resultsB.json>       Diff two results files by test/step IDs
  flaky <fileOrDir> [more...]                Detect flaky tests/steps across many results files

Run options:
  --headed                                   Run browser in headed (UI) mode
  --slow-mo <ms>                             Slow down actions by <ms> (debug)
  --browser <name>                           chromium | firefox | webkit (default: chromium)
  --screenshot-on-fail                       Capture a screenshot on failure into ./artifacts/

Step retries:
  --step-retries <n>                         Retry each eligible step up to <n> times (default: 0)
  --retry-steps <id1,id2,...>                Only retry these step IDs (omit to retry all)
  --retry-delay-ms <ms>                      Fixed delay between retry attempts (default: 0)

Diff options:
  --out <path>                               Output file (default: artifacts/diff.json)

Flaky options:
  --out <path>                               Output file (default: artifacts/flaky.json)

Validate args:
  validate <file.json>                      Validate a suite or results file against schemas

Schemas:
  schemas/test-suite.v1.json
  schemas/results.v1.json

Examples:
  testergizer run tests/login.saucedemo.json --headed
  testergizer run tests/login.saucedemo.json --step-retries 2 --retry-steps login-button-value --retry-delay-ms 200
  testergizer diff artifacts/results.json artifacts/results.prev.json --out artifacts/diff.json
  testergizer flaky artifacts/ --out artifacts/flaky.json
    testergizer validate tests/login.saucedemo.json
  testergizer validate artifacts/results.json

`);
}
// Execute CLI
cli().catch(err => {
    console.error(err);
    process.exit(1);
});
