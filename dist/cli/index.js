"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cli = cli;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const CoreRunner_1 = require("../core/CoreRunner");
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

Diff options:
  --out <path>

Flaky options:
  --out <path>
`);
}
function isSuiteJson(json) {
    return json && Array.isArray(json.tests);
}
function isTestJson(json) {
    return json && Array.isArray(json.steps) && typeof json.id === "string";
}
function cli() {
    const [, , cmd, ...args] = process.argv;
    if (!cmd) {
        printUsage();
        process.exit(1);
    }
    /* ============================
       RUN
       ============================ */
    if (cmd === "run") {
        const suitePath = args[0];
        if (!suitePath) {
            console.error("Missing suite path");
            process.exit(1);
        }
        const absolutePath = path_1.default.resolve(suitePath);
        if (!fs_1.default.existsSync(absolutePath)) {
            console.error(`Suite file not found: ${absolutePath}`);
            process.exit(1);
        }
        const headed = args.includes("--headed");
        const headless = args.includes("--headless") ? true : !headed;
        const slowMoIdx = args.indexOf("--slow-mo");
        const slowMoMs = slowMoIdx >= 0 ? Number(args[slowMoIdx + 1]) : undefined;
        const raw = fs_1.default.readFileSync(absolutePath, "utf-8");
        const json = JSON.parse(raw);
        // Validate as a suite if it looks like a suite
        if (isSuiteJson(json)) {
            // Optional but recommended: keep your existing schema validation gate
            (0, validateSuite_1.validateSuite)(json);
            const runner = new CoreRunner_1.CoreRunner({
                executionMode: "stub", // TEMPORARY — until --mode flag is added
                headless,
                slowMoMs,
            });
            (async () => {
                try {
                    for (const test of json.tests) {
                        if (!test || !Array.isArray(test.steps)) {
                            throw new Error(`Invalid test entry (missing steps) in suite: ${absolutePath}`);
                        }
                        await runner.run(test);
                        console.log(`Executed test: ${test.id}`);
                    }
                }
                finally {
                    await runner.dispose();
                }
            })().catch(err => {
                console.error(err);
                process.exit(1);
            });
            return;
        }
        // Support a single-test JSON (developer convenience)
        if (isTestJson(json)) {
            const runner = new CoreRunner_1.CoreRunner({
                executionMode: "stub", // TEMPORARY — until --mode flag is added
                headless,
                slowMoMs,
            });
            runner
                .run(json)
                .then(() => runner.dispose())
                .catch(err => {
                console.error(err);
                process.exit(1);
            });
            return;
        }
        console.error("Input file is neither a suite (tests[]) nor a test (steps[]).");
        process.exit(1);
    }
    /* ============================
       VALIDATE
       ============================ */
    if (cmd === "validate") {
        const filePath = args[0];
        if (!filePath) {
            console.error("Missing file path");
            process.exit(1);
        }
        let ok = true;
        let validatedType = null;
        try {
            const raw = fs_1.default.readFileSync(filePath, "utf-8");
            const json = JSON.parse(raw);
            if (json.tests && json.summary) {
                (0, validateResults_1.validateResults)(json);
                validatedType = "results";
            }
            else {
                (0, validateSuite_1.validateSuite)(json);
                validatedType = "suite";
            }
        }
        catch (err) {
            ok = false;
            console.error(err instanceof Error ? err.message : err);
        }
        if (ok && validatedType) {
            console.log(validatedType === "results"
                ? "Results schema validation passed"
                : "Suite schema validation passed");
        }
        process.exit(ok ? 0 : 1);
    }
    /* ============================
       DIFF
       ============================ */
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
    /* ============================
       FLAKY
       ============================ */
    if (cmd === "flaky") {
        const rest = [...args];
        const outIdx = rest.indexOf("--out");
        const outOverride = outIdx >= 0 ? rest[outIdx + 1] : undefined;
        const inputs = outIdx >= 0
            ? rest.filter((_, i) => i !== outIdx && i !== outIdx + 1)
            : rest;
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
