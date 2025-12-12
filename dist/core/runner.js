"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSuiteFromFile = runSuiteFromFile;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
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
async function runSuiteFromFile(suitePath, options = {}) {
    const artifactsDir = ensureArtifactsDir();
    const raw = fs_1.default.readFileSync(suitePath, "utf-8");
    const suite = JSON.parse(raw);
    console.log(`Loaded suite: ${suite.suiteName}`);
    console.log(`Running in ${options.headless === false ? "headed" : "headless"} mode (${options.browser ?? "chromium"})`);
    const results = {
        suite: suite.suiteName,
        suitePath,
        startedAt: new Date().toISOString(),
        options: {
            headless: options.headless !== false,
            slowMo: options.slowMo ?? null,
            browser: options.browser ?? "chromium",
            screenshotOnFail: !!options.screenshotOnFail
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
            steps: []
        };
        try {
            for (const step of test.steps ?? []) {
                if (step.disabled) {
                    console.log(`↷ Step skipped (disabled): ${step.action}`);
                    testResult.steps.push({ action: step.action, skipped: true, reason: "disabled" });
                    continue;
                }
                const stepStart = Date.now();
                console.log("→ Step:", step.action);
                try {
                    switch (step.action) {
                        case "goto":
                            await page.goto(step.url, {
                                waitUntil: step.waitUntil ?? "load",
                                timeout: step.timeoutMs ?? 30000
                            });
                            break;
                        case "assert":
                            await (0, assertions_1.runAssertion)(page, step);
                            break;
                        default:
                            throw new Error(`Unknown action: ${step.action}`);
                    }
                    testResult.steps.push({
                        action: step.action,
                        status: "passed",
                        durationMs: Date.now() - stepStart
                    });
                }
                catch (stepErr) {
                    testResult.steps.push({
                        action: step.action,
                        status: "failed",
                        durationMs: Date.now() - stepStart,
                        error: String(stepErr?.message ?? stepErr)
                    });
                    throw stepErr;
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
