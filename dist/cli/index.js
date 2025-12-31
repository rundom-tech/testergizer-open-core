"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cli = cli;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const fast_glob_1 = __importDefault(require("fast-glob"));
const runSuiteFromFile_1 = require("./runSuiteFromFile");
const validateSuite_1 = require("../core/validateSuite");
const validateResults_1 = require("../core/validateResults");
const diff_1 = require("../tools/diff");
const flaky_1 = require("../tools/flaky");
/* ---------------------------------- */
/* helpers                             */
/* ---------------------------------- */
function sanitizeId(input) {
    return String(input || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
}
function formatTimestamp(iso) {
    const noMs = iso.replace(/\..+/, "").replace(/Z$/, "");
    const [date, time] = noMs.split("T");
    if (!date || !time)
        return String(Date.now());
    return `${date.replace(/-/g, "")}-${time.replace(/:/g, "")}`;
}
function expandInputs(inputs) {
    return inputs.flatMap(input => input.includes("*") ? fast_glob_1.default.sync(input, { onlyFiles: true }) : [input]);
}
function printUsage() {
    console.log(`
Testergizer Open Core

Usage:
  testergizer <command> [args] [options]

Commands:
  run <suite.json>
  validate <file.json>
  diff <resultsA> <resultsB>
  flaky <fileOrDir> [more...]

Run options:
  --mode <stub|execute>
  --headed
  --headless
  --slow-mo <ms>
  --base-url <url>

Diff / Flaky options:
  --out <path>
`);
}
/* ---------------------------------- */
/* CLI                                 */
/* ---------------------------------- */
async function cli() {
    const [, , cmd, ...args] = process.argv;
    if (!cmd) {
        printUsage();
        process.exit(1);
    }
    /* ---------- run ---------- */
    if (cmd === "run") {
        const suitePath = args[0];
        if (!suitePath) {
            console.error("Missing suite path");
            process.exit(1);
        }
        const opts = {};
        const modeIdx = args.indexOf("--mode");
        if (modeIdx >= 0) {
            opts.executionMode = args[modeIdx + 1];
        }
        if (args.includes("--headed"))
            opts.headless = false;
        if (args.includes("--headless"))
            opts.headless = true;
        const slowMoIdx = args.indexOf("--slow-mo");
        if (slowMoIdx >= 0)
            opts.slowMo = Number(args[slowMoIdx + 1]);
        const baseUrlIdx = args.indexOf("--base-url");
        if (baseUrlIdx >= 0)
            opts.baseUrl = String(args[baseUrlIdx + 1]);
        try {
            const { runResult, outPath } = await (0, runSuiteFromFile_1.runSuiteFromFile)(suitePath, opts);
            console.log(`Results written to ${outPath}`);
            process.exit(runResult.summary.failed > 0 ? 10 : 0);
        }
        catch (err) {
            console.error(err instanceof Error ? err.message : err);
            process.exit(1);
        }
    }
    /* ---------- validate ---------- */
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
    /* ---------- diff ---------- */
    if (cmd === "diff") {
        const [a, b, ...rest] = args;
        if (!a || !b) {
            console.error("Missing diff inputs");
            process.exit(1);
        }
        const outIdx = rest.indexOf("--out");
        const outOverride = outIdx >= 0 ? rest[outIdx + 1] : undefined;
        const aFiles = expandInputs([a]);
        const bFiles = expandInputs([b]);
        if (!aFiles.length || !bFiles.length) {
            console.error("No matching result files found");
            process.exit(1);
        }
        const diff = (0, diff_1.diffResults)(aFiles, bFiles);
        const suiteId = sanitizeId(diff.suiteId ?? "unknown");
        const ts = formatTimestamp(diff.timestamp ?? new Date().toISOString());
        const outPath = outOverride
            ? path_1.default.resolve(process.cwd(), outOverride)
            : path_1.default.join("artifacts", suiteId, `diff_${suiteId}_${ts}.json`);
        fs_1.default.mkdirSync(path_1.default.dirname(outPath), { recursive: true });
        (0, diff_1.writeDiff)(outPath, diff);
        console.log(`Diff written to ${outPath}`);
        process.exit(0);
    }
    /* ---------- flaky ---------- */
    if (cmd === "flaky") {
        const rest = [...args];
        const outIdx = rest.indexOf("--out");
        const outOverride = outIdx >= 0 ? rest[outIdx + 1] : undefined;
        const inputs = outIdx >= 0
            ? rest.filter((_, i) => i !== outIdx && i !== outIdx + 1)
            : rest;
        const files = expandInputs(inputs);
        if (!files.length) {
            console.error("No matching result files found");
            process.exit(1);
        }
        const analysis = (0, flaky_1.detectFlaky)(files);
        const suiteId = sanitizeId(analysis.suiteId ?? "unknown");
        const ts = formatTimestamp(analysis.timestamp ?? new Date().toISOString());
        const outPath = outOverride
            ? path_1.default.resolve(process.cwd(), outOverride)
            : path_1.default.join("artifacts", suiteId, `flaky_${suiteId}_${ts}.json`);
        fs_1.default.mkdirSync(path_1.default.dirname(outPath), { recursive: true });
        fs_1.default.writeFileSync(outPath, JSON.stringify(analysis, null, 2), "utf-8");
        console.log(`Flaky analysis written to ${outPath}`);
        process.exit(0);
    }
    printUsage();
    process.exit(1);
}
// eslint-disable-next-line @typescript-eslint/no-floating-promises
cli();
