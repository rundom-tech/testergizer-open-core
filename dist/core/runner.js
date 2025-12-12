"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSuiteFromFile = runSuiteFromFile;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const playwright_1 = require("playwright");
const assertions_1 = require("./assertions");
function ensureArtifactsDir() {
    const dir = path_1.default.resolve(process.cwd(), "artifacts");
    fs_1.default.mkdirSync(dir, { recursive: true });
    return dir;
}
function safeFileName(input) {
    return String(input).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}
function getStepId(step, index) {
    if (step?.id)
        return String(step.id);
    return `step-${index + 1}`;
}
function shouldRetry(stepId, options) {
    const retries = options.stepRetries ?? 0;
    if (retries <= 0)
        return false;
    const allow = options.retryStepIds?.filter(Boolean) ?? [];
    if (allow.length === 0)
        return true;
    return allow.includes(stepId);
}
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function runSuiteFromFile(suitePath, options = {}) {
    const artifactsDir = ensureArtifactsDir();
    const raw = fs_1.default.readFileSync(suitePath, "utf-8");
    const suite = JSON.parse(raw);
    const runId = crypto_1.default.randomUUID ? crypto_1.default.randomUUID() : crypto_1.default.randomBytes(16).toString("hex");
    const suiteVersion = typeof suite.version === "string" ? suite.version : "1.0";
    console.log(`Loaded suite: ${suite.suiteName}`);
    console.log(`Suite version: ${suiteVersion}`);
    console.log(`Running in ${options.headless === false ? "headed" : "headless"} mode (${options.browser ?? "chromium"})`);
    const results = {
        schemaVersion: "1.0",
        runId,
        suite: suite.suiteName,
        suitePath,
        suiteVersion,
        startedAt: new Date().toISOString(),
        options: {
            headless: options.headless !== false,
            slowMo: options.slowMo ?? null,
            browser: options.browser ?? "chromium",
            screenshotOnFail: !!options.screenshotOnFail,
            stepRetries: options.stepRetries ?? 0,
            retryStepIds: options.retryStepIds ?? [],
            retryDelayMs: options.retryDelayMs ?? 0
        },
        tests: []
    };
    const browserType = options.browser === "firefox" ? playwright_1.firefox : options.browser === "webkit" ? playwright_1.webkit : playwright_1.chromium;
    let suiteOk = true;
    for (const test of suite.tests ?? []) {
        const testStart = Date.now();
        console.log(`\n=== Test: ${test.name} ===`);
        const browser = await browserType.launch({
            headless: options.headless !== false,
            slowMo: options.slowMo
        });
        const page = await browser.newPage();
        const testResult = {
            id: test.id ?? null,
            name: test.name,
            status: "passed",
            startedAt: new Date().toISOString(),
            durationMs: 0,
            error: null,
            steps: []
        };
        try {
            const stepsArr = test.steps ?? [];
            for (let i = 0; i < stepsArr.length; i++) {
                const step = stepsArr[i];
                const stepId = getStepId(step, i);
                if (step.disabled) {
                    console.log(`↷ Step skipped (${stepId}): ${step.action}`);
                    testResult.steps.push({
                        id: stepId,
                        action: step.action,
                        skipped: true,
                        reason: "disabled",
                        status: null,
                        durationMs: 0,
                        attempts: 0,
                        flaky: false,
                        error: null,
                        attemptErrors: []
                    });
                    continue;
                }
                const stepStart = Date.now();
                const attemptErrors = [];
                const maxAttempts = 1 + (options.stepRetries ?? 0);
                const eligible = shouldRetry(stepId, options);
                let attempts = 0;
                let lastErr = null;
                for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                    attempts = attempt;
                    console.log(`→ Step (${stepId}) [${attempt}/${maxAttempts}]: ${step.action}`);
                    try {
                        switch (step.action) {
                            case "goto":
                                await page.goto(step.url, {
                                    waitUntil: step.waitUntil ?? "load",
                                    timeout: step.timeoutMs ?? 30000
                                });
                                lastErr = null;
                                break;
                            case "assert":
                                await (0, assertions_1.runAssertion)(page, step);
                                lastErr = null;
                                break;
                            default:
                                throw new Error(`Unknown action: ${step.action}`);
                        }
                        break; // succeeded
                    }
                    catch (err) {
                        lastErr = err;
                        attemptErrors.push(String(err?.message ?? err));
                        const isLast = attempt === maxAttempts;
                        if (!eligible || isLast)
                            break;
                        const d = options.retryDelayMs ?? 0;
                        if (d > 0)
                            await delay(d);
                    }
                }
                if (lastErr) {
                    testResult.steps.push({
                        id: stepId,
                        action: step.action,
                        status: "failed",
                        skipped: false,
                        reason: "",
                        durationMs: Date.now() - stepStart,
                        attempts,
                        flaky: false,
                        error: String(lastErr?.message ?? lastErr),
                        attemptErrors
                    });
                    throw lastErr;
                }
                else {
                    testResult.steps.push({
                        id: stepId,
                        action: step.action,
                        status: "passed",
                        skipped: false,
                        reason: "",
                        durationMs: Date.now() - stepStart,
                        attempts,
                        flaky: attempts > 1,
                        error: null,
                        attemptErrors
                    });
                }
            }
            console.log(`✔ Test passed: ${test.name}`);
        }
        catch (err) {
            suiteOk = false;
            testResult.status = "failed";
            testResult.error = String(err?.message ?? err);
            if (options.screenshotOnFail) {
                const file = `${safeFileName(test.id ?? test.name)}-failure.png`;
                const outPath = path_1.default.join(artifactsDir, file);
                await page.screenshot({ path: outPath, fullPage: true });
                testResult.screenshot = path_1.default.relative(process.cwd(), outPath).replace(/\\/g, "/");
                console.error(`Screenshot saved: ${testResult.screenshot}`);
            }
            console.error(`✖ Test failed: ${test.name}`);
        }
        finally {
            testResult.durationMs = Date.now() - testStart;
            results.tests.push(testResult);
            await browser.close();
        }
    }
    results.endedAt = new Date().toISOString();
    results.summary = {
        total: results.tests.length,
        passed: results.tests.filter((t) => t.status === "passed").length,
        failed: results.tests.filter((t) => t.status === "failed").length
    };
    const resultsPath = path_1.default.join(artifactsDir, "results.json");
    fs_1.default.writeFileSync(resultsPath, JSON.stringify(results, null, 2), "utf-8");
    console.log(`\nResults written to ${path_1.default.relative(process.cwd(), resultsPath)}`);
    console.log(suiteOk ? `✔ Suite passed: ${suite.suiteName}` : `✖ Suite failed: ${suite.suiteName}`);
    return suiteOk;
}
