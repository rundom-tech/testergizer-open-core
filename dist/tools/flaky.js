"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveInputs = resolveInputs;
exports.detectFlaky = detectFlaky;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
/**
 * Collect JSON files from a file or a directory (non-recursive).
 */
function listJsonFiles(input) {
    const p = path_1.default.resolve(process.cwd(), input);
    if (!fs_1.default.existsSync(p))
        return [];
    const stat = fs_1.default.statSync(p);
    if (stat.isFile())
        return p.toLowerCase().endsWith(".json") ? [p] : [];
    if (!stat.isDirectory())
        return [];
    const files = [];
    for (const name of fs_1.default.readdirSync(p)) {
        const full = path_1.default.join(p, name);
        if (fs_1.default.statSync(full).isFile() && name.toLowerCase().endsWith(".json")) {
            files.push(full);
        }
    }
    return files.sort();
}
/**
 * Canonical test key.
 */
function testKey(t) {
    return String(t.id ?? t.name);
}
/**
 * Last failure reason for a step.
 */
function lastReason(step) {
    const errs = step?.attemptErrors;
    if (!Array.isArray(errs) || errs.length === 0)
        return "unknown";
    const last = errs[errs.length - 1];
    return String(last?.reason ?? "unknown");
}
/**
 * Canonical suiteId extraction.
 * This matches the actual runner output.
 */
function extractSuiteId(run) {
    return (run?.meta?.suite?.id || // ✅ canonical (current runner)
        run?.suiteId || // legacy / future
        run?.meta?.suiteId ||
        run?.suite?.id ||
        run?.suite?.suiteId ||
        undefined);
}
/**
 * Expand file and directory inputs into JSON files.
 */
function resolveInputs(inputs) {
    const out = [];
    for (const inp of inputs)
        out.push(...listJsonFiles(inp));
    return Array.from(new Set(out)).sort();
}
/**
 * Detect flaky tests and steps across multiple result runs.
 */
function detectFlaky(resultsPaths) {
    const files = resolveInputs(resultsPaths);
    if (files.length === 0) {
        throw new Error("No JSON result files found in provided inputs");
    }
    const runs = files.map(p => JSON.parse(fs_1.default.readFileSync(p, "utf-8")));
    // ---- derive suiteId ----
    const suiteIds = Array.from(new Set(runs.map(r => extractSuiteId(r)).filter(Boolean)));
    const suiteId = suiteIds.length === 1
        ? suiteIds[0]
        : suiteIds.length > 1
            ? "mixed"
            : "unknown";
    const timestamp = new Date().toISOString();
    // ---- aggregate stats ----
    const stepStats = {};
    const testStats = {};
    for (const r of runs) {
        for (const t of (r.tests ?? [])) {
            const tk = testKey(t);
            const ts = testStats[tk] ?? { passes: 0, fails: 0, runs: 0 };
            ts.runs += 1;
            if (t.status === "passed")
                ts.passes += 1;
            if (t.status === "failed")
                ts.fails += 1;
            testStats[tk] = ts;
            for (const s of (t.steps ?? [])) {
                const sid = String(s.id);
                const key = `${tk}::${sid}`;
                const ss = stepStats[key] ?? {
                    passes: 0,
                    fails: 0,
                    runs: 0,
                    reasons: {}
                };
                ss.runs += 1;
                if (s.status === "passed")
                    ss.passes += 1;
                if (s.status === "failed") {
                    ss.fails += 1;
                    const reason = lastReason(s);
                    ss.reasons[reason] = (ss.reasons[reason] ?? 0) + 1;
                }
                stepStats[key] = ss;
            }
        }
    }
    // ---- flaky detection ----
    const flakySteps = [];
    for (const [k, v] of Object.entries(stepStats)) {
        if (v.passes > 0 && v.fails > 0) {
            flakySteps.push({
                key: k,
                runs: v.runs,
                passes: v.passes,
                fails: v.fails,
                failRate: v.fails / v.runs,
                reasons: v.reasons
            });
        }
    }
    flakySteps.sort((a, b) => b.failRate - a.failRate || a.key.localeCompare(b.key));
    const flakyTests = [];
    for (const [k, v] of Object.entries(testStats)) {
        if (v.passes > 0 && v.fails > 0) {
            flakyTests.push({
                test: k,
                runs: v.runs,
                passes: v.passes,
                fails: v.fails,
                failRate: v.fails / v.runs
            });
        }
    }
    flakyTests.sort((a, b) => b.failRate - a.failRate || a.test.localeCompare(b.test));
    // ---- final output ----
    return {
        schemaVersion: "1.0",
        type: "flaky-analysis",
        suiteId,
        timestamp,
        runCount: runs.length,
        inputs: files,
        flakyTests,
        flakySteps,
        summary: {
            flakyTests: flakyTests.length,
            flakySteps: flakySteps.length
        }
    };
}
