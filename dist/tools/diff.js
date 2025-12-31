"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.diffResults = diffResults;
exports.writeDiff = writeDiff;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
/* ---------------------------------- */
/* Helpers                             */
/* ---------------------------------- */
function loadResult(filePath) {
    const raw = fs_1.default.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
}
function indexResults(files) {
    const index = new Map();
    for (const file of files) {
        const run = loadResult(file);
        for (const test of run.tests) {
            const testKey = test.id;
            if (!index.has(testKey)) {
                index.set(testKey, new Map());
            }
            // Test-level status (null stepId)
            index.get(testKey).set(null, test.status);
            for (const step of test.steps ?? []) {
                index.get(testKey).set(step.id, step.status);
            }
        }
    }
    return index;
}
/* ---------------------------------- */
/* Public API                          */
/* ---------------------------------- */
function diffResults(aFiles, bFiles) {
    if (!aFiles.length || !bFiles.length) {
        throw new Error("diffResults requires non-empty file lists");
    }
    const indexA = indexResults(aFiles);
    const indexB = indexResults(bFiles);
    const allTests = new Set([
        ...indexA.keys(),
        ...indexB.keys()
    ]);
    const differences = [];
    for (const testId of allTests) {
        const stepsA = indexA.get(testId) ?? new Map();
        const stepsB = indexB.get(testId) ?? new Map();
        const allSteps = new Set([
            ...stepsA.keys(),
            ...stepsB.keys()
        ]);
        for (const stepId of allSteps) {
            const statusA = stepsA.get(stepId) ?? "missing";
            const statusB = stepsB.get(stepId) ?? "missing";
            if (statusA !== statusB) {
                differences.push({
                    testId,
                    stepId: stepId ?? undefined,
                    statusA,
                    statusB
                });
            }
        }
    }
    // Try to infer suiteId from first file
    let suiteId;
    try {
        const first = loadResult(aFiles[0]);
        suiteId = first.suiteId;
    }
    catch {
        suiteId = undefined;
    }
    return {
        suiteId,
        timestamp: new Date().toISOString(),
        differences
    };
}
/* ---------------------------------- */
/* Writer                              */
/* ---------------------------------- */
function writeDiff(outPath, diff) {
    fs_1.default.mkdirSync(path_1.default.dirname(outPath), { recursive: true });
    fs_1.default.writeFileSync(outPath, JSON.stringify(diff, null, 2), "utf-8");
}
