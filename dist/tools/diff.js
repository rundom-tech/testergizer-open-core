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
function diffResults(aPath, bPath) {
    const a = JSON.parse(fs_1.default.readFileSync(aPath, "utf-8"));
    const b = JSON.parse(fs_1.default.readFileSync(bPath, "utf-8"));
    const aTests = indexBy(a.tests ?? [], testKey);
    const bTests = indexBy(b.tests ?? [], testKey);
    const testChanges = [];
    const stepChanges = [];
    for (const key of new Set([...Object.keys(aTests), ...Object.keys(bTests)])) {
        const at = aTests[key];
        const bt = bTests[key];
        if (!at || !bt) {
            testChanges.push({ test: key, change: at ? "removed" : "added" });
            continue;
        }
        if (at.status !== bt.status) {
            testChanges.push({
                test: key,
                change: "status",
                from: at.status,
                to: bt.status
            });
        }
        const aSteps = indexBy(at.steps ?? [], s => s.id);
        const bSteps = indexBy(bt.steps ?? [], s => s.id);
        for (const sid of new Set([...Object.keys(aSteps), ...Object.keys(bSteps)])) {
            const as = aSteps[sid];
            const bs = bSteps[sid];
            if (!as || !bs) {
                stepChanges.push({ step: `${key}::${sid}`, change: as ? "removed" : "added" });
                continue;
            }
            if (as.status !== bs.status) {
                stepChanges.push({
                    step: `${key}::${sid}`,
                    change: "status",
                    from: as.status,
                    to: bs.status
                });
            }
        }
    }
    return {
        schemaVersion: "1.0",
        type: "results-diff",
        tests: testChanges,
        steps: stepChanges
    };
}
function writeDiff(outPath, diff) {
    fs_1.default.mkdirSync(path_1.default.dirname(outPath), { recursive: true });
    fs_1.default.writeFileSync(outPath, JSON.stringify(diff, null, 2), "utf-8");
}
