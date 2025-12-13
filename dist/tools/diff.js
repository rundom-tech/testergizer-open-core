"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.diffResults = diffResults;
exports.writeDiff = writeDiff;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function indexBy(arr, keyFn) {
    const out = {};
    for (const item of arr)
        out[keyFn(item)] = item;
    return out;
}
function testKey(t) {
    return String(t.id ?? t.name);
}
function lastReason(step) {
    const errs = step?.attemptErrors;
    if (!Array.isArray(errs) || errs.length === 0)
        return null;
    const last = errs[errs.length - 1];
    return last?.reason ?? null;
}
function diffResults(aPath, bPath) {
    const a = JSON.parse(fs_1.default.readFileSync(aPath, "utf-8"));
    const b = JSON.parse(fs_1.default.readFileSync(bPath, "utf-8"));
    const aTests = a.tests ?? [];
    const bTests = b.tests ?? [];
    const aIdx = indexBy(aTests, testKey);
    const bIdx = indexBy(bTests, testKey);
    const allTestKeys = Array.from(new Set([...Object.keys(aIdx), ...Object.keys(bIdx)])).sort();
    const testDiffs = [];
    const stepChanges = [];
    for (const tk of allTestKeys) {
        const at = aIdx[tk];
        const bt = bIdx[tk];
        if (!at) {
            testDiffs.push({ test: tk, change: "added", status: bt.status });
            continue;
        }
        if (!bt) {
            testDiffs.push({ test: tk, change: "removed", status: at.status });
            continue;
        }
        if (at.status !== bt.status) {
            testDiffs.push({ test: tk, change: "status", from: at.status, to: bt.status });
        }
        const aSteps = at.steps ?? [];
        const bSteps = bt.steps ?? [];
        const aS = indexBy(aSteps, (s) => String(s.id));
        const bS = indexBy(bSteps, (s) => String(s.id));
        const allStepIds = Array.from(new Set([...Object.keys(aS), ...Object.keys(bS)])).sort();
        for (const sid of allStepIds) {
            const as = aS[sid];
            const bs = bS[sid];
            if (!as) {
                stepChanges.push({ key: `${tk}::${sid}`, change: "added", status: bs.status });
                continue;
            }
            if (!bs) {
                stepChanges.push({ key: `${tk}::${sid}`, change: "removed", status: as.status });
                continue;
            }
            if (as.status !== bs.status) {
                stepChanges.push({ key: `${tk}::${sid}`, change: "status", from: as.status, to: bs.status });
            }
            else if ((as.attempts ?? 1) !== (bs.attempts ?? 1)) {
                stepChanges.push({ key: `${tk}::${sid}`, change: "attempts", from: as.attempts ?? 1, to: bs.attempts ?? 1 });
            }
            const ar = lastReason(as);
            const br = lastReason(bs);
            if (ar && br && ar !== br) {
                stepChanges.push({ key: `${tk}::${sid}`, change: "retry-reason", from: ar, to: br });
            }
        }
    }
    return {
        schemaVersion: "1.0",
        type: "results-diff",
        a: { path: aPath, runId: a.runId, startedAt: a.startedAt },
        b: { path: bPath, runId: b.runId, startedAt: b.startedAt },
        tests: testDiffs,
        steps: stepChanges,
        summary: { testChanges: testDiffs.length, stepChanges: stepChanges.length }
    };
}
function writeDiff(outPath, diff) {
    fs_1.default.mkdirSync(path_1.default.dirname(outPath), { recursive: true });
    fs_1.default.writeFileSync(outPath, JSON.stringify(diff, null, 2), "utf-8");
}
