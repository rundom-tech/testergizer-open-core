"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cli = cli;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const runner_1 = require("../core/runner");
const validateSuite_1 = require("../core/validateSuite");
const validateResults_1 = require("../core/validateResults");
const diff_1 = require("../tools/diff");
const flaky_1 = require("../tools/flaky");
function sanitizeId(input) {
    return String(input || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
}
function formatTimestamp(iso) {
    // 2025-12-15T04:07:33.123Z -> 20251215-040733
    const noMs = iso.replace(/\..+/, "").replace(/Z$/, "");
    const parts = noMs.split("T");
    const date = parts[0];
    const time = parts[1];
    if (!date || !time)
        return String(Date.now());
    return `${date.replace(/-/g, "")}-${time.replace(/:/g, "")}`;
}
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
  --headless
  --slow-mo <ms>
  --browser <name>
  --screenshot-on-fail

Retry options:
  --step-retries <n>
  --retry-steps <id1,id2,...>
  --retry-step-ids <id1,id2,...>
  --retry-delay-ms <ms>

Diff options:
  --out <path>                               Output file (default: artifacts/diff.json)

Flaky options:
  --out <path>                               Output file (default: artifacts/<suiteId>/flaky_<suiteId>_<timestamp>.json)
`);
}
function cli() {
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
        const opts = {
            headed: args.includes("--headed"),
            headless: args.includes("--headless"),
        };
        const slowMoIdx = args.indexOf("--slow-mo");
        if (slowMoIdx >= 0)
            opts.slowMo = Number(args[slowMoIdx + 1]);
        const browserIdx = args.indexOf("--browser");
        if (browserIdx >= 0)
            opts.browser = args[browserIdx + 1];
        const retriesIdx = args.indexOf("--step-retries");
        if (retriesIdx >= 0)
            opts.stepRetries = Number(args[retriesIdx + 1]);
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
        (0, runner_1.runSuiteFromFile)(suitePath, opts).catch(err => {
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
            const raw = fs_1.default.readFileSync(filePath, "utf-8");
            const json = JSON.parse(raw);
            if (json.tests && json.summary) {
                (0, validateResults_1.validateResults)(json);
            }
            else {
                (0, validateSuite_1.validateSuite)(json);
            }
        }
        catch (err) {
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
        const outOverride = outIdx >= 0 ? rest[outIdx + 1] : undefined;
        const diff = (0, diff_1.diffResults)(a, b);
        const suiteIdRaw = diff.suiteId ?? "unknown";
        const suiteId = sanitizeId(suiteIdRaw) || "unknown";
        const ts = formatTimestamp(diff.timestamp ?? new Date().toISOString());
        const outPath = outOverride
            ? path_1.default.resolve(process.cwd(), outOverride)
            : path_1.default.join("artifacts", suiteId, `diff_${suiteId}_${ts}.json`);
        fs_1.default.mkdirSync(path_1.default.dirname(outPath), { recursive: true });
        fs_1.default.writeFileSync(outPath, JSON.stringify(diff, null, 2), "utf-8");
        console.log(`Diff written to ${outPath}`);
        return;
    }
    if (cmd === "flaky") {
        const rest = [...args];
        const outIdx = rest.indexOf("--out");
        const outOverride = outIdx >= 0 ? rest[outIdx + 1] : undefined;
        const inputs = outIdx >= 0 ? rest.filter((_, i) => i !== outIdx && i !== outIdx + 1) : rest;
        if (inputs.length === 0) {
            console.error("Missing path(s)");
            process.exit(1);
        }
        const analysis = (0, flaky_1.detectFlaky)(inputs);
        const suiteIdRaw = analysis.suiteId ?? "unknown";
        const suiteId = sanitizeId(suiteIdRaw) || "unknown";
        const ts = formatTimestamp(analysis.timestamp ?? new Date().toISOString());
        const outPath = outOverride
            ? path_1.default.resolve(process.cwd(), outOverride)
            : path_1.default.join("artifacts", suiteId, `flaky_${suiteId}_${ts}.json`);
        fs_1.default.mkdirSync(path_1.default.dirname(outPath), { recursive: true });
        fs_1.default.writeFileSync(outPath, JSON.stringify(analysis, null, 2), "utf-8");
        console.log(`Flaky analysis written to ${outPath}`);
        return;
    }
    printUsage();
    process.exit(1);
}
cli();
