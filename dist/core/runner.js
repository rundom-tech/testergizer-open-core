"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSuiteFromFile = runSuiteFromFile;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const playwright_1 = require("playwright");
const validateSuite_1 = require("./validateSuite");
const assertions_1 = require("./assertions");
function sanitizeId(input) {
    return input
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
}
function formatTimestamp(iso) {
    // 2025-03-08T09:14:23.123Z -> 20250308-091423
    const noMs = iso.replace(/\..+/, "").replace(/Z$/, "");
    const [date, time] = noMs.split("T");
    return `${date.replace(/-/g, "")}-${time.replace(/:/g, "")}`;
}
function pickBrowserType(name) {
    const n = (name || "chromium").toLowerCase();
    if (n === "firefox")
        return playwright_1.firefox;
    if (n === "webkit")
        return playwright_1.webkit;
    return playwright_1.chromium;
}
function shouldRetryStep(stepId, retrySteps) {
    if (!retrySteps || retrySteps.length === 0)
        return true;
    return retrySteps.includes(stepId);
}
async function runSuiteFromFile(suitePath, options = {}) {
    const raw = fs_1.default.readFileSync(suitePath, "utf-8");
    const suite = JSON.parse(raw);
    (0, validateSuite_1.validateSuite)(suite);
    const startedAt = new Date().toISOString();
    const suiteId = suite.id ||
        suite.suiteId ||
        sanitizeId(suite.suiteName || "suite");
    const browserType = pickBrowserType(options.browser);
    const browser = await browserType.launch({
        headless: !options.headed,
        slowMo: options.slowMo
    });
    const context = await browser.newContext();
    const page = await context.newPage();
    const results = {
        schemaVersion: "v1",
        runId: `${suiteId}-${Date.now()}`,
        suite: suite.suiteName,
        suiteId,
        suitePath,
        startedAt,
        endedAt: null,
        meta: {
            runnerVersion: "0.1.1"
        },
        tests: [],
        summary: {
            total: 0,
            passed: 0,
            failed: 0
        }
    };
    for (const test of suite.tests) {
        const testResult = {
            id: test.id || null,
            name: test.name,
            status: "passed",
            steps: []
        };
        for (const step of test.steps) {
            if (step.disabled)
                continue;
            const stepId = step.id || "";
            const stepResult = {
                id: stepId,
                action: step.action,
                status: "passed",
                attempts: 0,
                attemptErrors: []
            };
            const configuredRetries = options.stepRetries ?? 0;
            const eligibleForRetry = !!stepId && shouldRetryStep(stepId, options.retrySteps);
            const maxRetries = eligibleForRetry ? configuredRetries : 0;
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                stepResult.attempts++;
                try {
                    if (step.action === "goto") {
                        await page.goto(step.url, { waitUntil: step.waitUntil || "load" });
                    }
                    else if (step.action === "assert") {
                        await (0, assertions_1.runAssertion)(page, step);
                    }
                    else {
                        throw new Error(`Unknown step action: ${step.action}`);
                    }
                    break;
                }
                catch (err) {
                    stepResult.attemptErrors.push({
                        reason: err?.name || "error",
                        message: err?.message || String(err)
                    });
                    if (attempt === maxRetries) {
                        stepResult.status = "failed";
                        testResult.status = "failed";
                    }
                    else if (options.retryDelayMs) {
                        await new Promise(r => setTimeout(r, options.retryDelayMs));
                    }
                }
            }
            testResult.steps.push(stepResult);
        }
        results.tests.push(testResult);
        results.summary.total++;
        if (testResult.status === "passed")
            results.summary.passed++;
        else
            results.summary.failed++;
    }
    results.endedAt = new Date().toISOString();
    const baseDir = path_1.default.join("artifacts", suiteId);
    fs_1.default.mkdirSync(baseDir, { recursive: true });
    const ts = formatTimestamp(startedAt);
    const resultsPath = path_1.default.join(baseDir, `results_${ts}.json`);
    fs_1.default.writeFileSync(resultsPath, JSON.stringify(results, null, 2), "utf-8");
    await browser.close();
    console.log(`Results written to ${resultsPath}`);
}
