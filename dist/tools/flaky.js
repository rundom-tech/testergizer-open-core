"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveInputs = resolveInputs;
exports.detectFlaky = detectFlaky;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function testKey(t) {
    return String(t.id ?? t.name);
}
function resolveInputs(inputs) {
    const out = [];
    for (const inp of inputs) {
        const p = path_1.default.resolve(inp);
        if (!fs_1.default.existsSync(p))
            continue;
        if (fs_1.default.statSync(p).isFile())
            out.push(p);
        else {
            for (const f of fs_1.default.readdirSync(p)) {
                if (f.endsWith(".json"))
                    out.push(path_1.default.join(p, f));
            }
        }
    }
    return Array.from(new Set(out));
}
function detectFlaky(paths) {
    const runs = paths.map(p => JSON.parse(fs_1.default.readFileSync(p, "utf-8")));
    const stepStats = {};
    for (const r of runs) {
        for (const t of r.tests ?? []) {
            const tk = testKey(t);
            for (const s of t.steps ?? []) {
                const key = `${tk}::${s.id}`;
                stepStats[key] ?? (stepStats[key] = { pass: 0, fail: 0 });
                s.status === "passed" ? stepStats[key].pass++ : stepStats[key].fail++;
            }
        }
    }
    const flaky = Object.entries(stepStats)
        .filter(([_, v]) => v.pass > 0 && v.fail > 0)
        .map(([k, v]) => ({
        step: k,
        passes: v.pass,
        fails: v.fail,
        failRate: v.fail / (v.pass + v.fail)
    }));
    return {
        schemaVersion: "1.0",
        type: "flaky-analysis",
        runs: runs.length,
        flaky
    };
}
