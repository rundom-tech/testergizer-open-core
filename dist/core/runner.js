"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSuiteFromFile = runSuiteFromFile;
const fs_1 = __importDefault(require("fs"));
const playwright_1 = require("playwright");
const assertions_1 = require("./assertions");
async function runSuiteFromFile(suitePath, options = {}) {
    const raw = fs_1.default.readFileSync(suitePath, "utf-8");
    const suite = JSON.parse(raw);
    console.log(`Loaded suite: ${suite.suiteName}`);
    let failed = false;
    for (const test of suite.tests) {
        console.log(`\n=== Test: ${test.name} ===`);
        const browser = await playwright_1.chromium.launch({
            headless: options.headless !== false
        });
        const page = await browser.newPage();
        try {
            for (const step of test.steps) {
                if (step.disabled) {
                    console.log(`↷ Step skipped: ${step.action}`);
                    continue;
                }
                console.log("→ Step:", step.action);
                switch (step.action) {
                    case "goto":
                        await page.goto(step.url);
                        break;
                    case "assert":
                        await (0, assertions_1.runAssertion)(page, step);
                        break;
                    default:
                        throw new Error(`Unknown action: ${step.action}`);
                }
            }
            console.log(`✔ Test passed: ${test.name}`);
        }
        catch (err) {
            failed = true;
            console.error(`✖ Test failed: ${test.name}`);
            throw err;
        }
        finally {
            await browser.close();
        }
    }
    if (!failed) {
        console.log(`\n✔ Suite passed: ${suite.suiteName}`);
        process.exit(0);
    }
}
