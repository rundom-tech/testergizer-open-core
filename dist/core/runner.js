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
    return iso
        .replace(/[:]/g, "")
        .replace(/\..+/, "")
        .replace("T", "-");
}
async function runSuiteFromFile(suitePath, options = {}) {
    const raw = fs_1.default.readFileSync(suitePath, "utf-8");
    const suite = JSON.parse(raw);
    (0, validateSuite_1.validateSuite)(suite);
    const startedAt = new Date().toISOString();
    const suiteId = suite.id ||
        suite.suiteId ||
        sanitizeId(suite.suiteName || "suite");
    const browserType = options.browser === "firefox"
        ? playwright_1.firefox
        : options.browser === "webkit"
            ? playwright_1.webkit
            : playwright_1.chromium;
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
            const stepResult = {
                id: step.id || "",
                action: step.action,
                status: "passed",
                attempts: 0,
                attemptErrors: []
            };
            const maxRetries = options.stepRetries || 0;
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                stepResult.attempts++;
                try {
                    if (step.action === "goto") {
                        await page.goto(step.url, { waitUntil: step.waitUntil || "load" });
                    }
                    else if (step.action === "assert") {
                        await (0, assertions_1.runAssertion)(page, step);
                    }
                    break;
                }
                catch (err) {
                    stepResult.attemptErrors.push({
                        reason: err.name || "error",
                        message: err.message || String(err)
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
