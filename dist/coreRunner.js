"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoreRunner = void 0;
const playwright_1 = require("playwright");
class CoreRunner {
    constructor(options = {}) {
        this.browser = null;
        this.page = null;
        this.options = options;
        this.executionMode = options.executionMode ?? "playwright";
        console.log("CoreRunner executionMode =", this.executionMode);
    }
    async ensurePage() {
        if (this.executionMode === "stub") {
            throw new Error("ensurePage must not be called in stub execution mode");
        }
        if (!this.browser) {
            this.browser = await playwright_1.chromium.launch({
                headless: this.options.headless ?? true,
                slowMo: this.options.slowMoMs,
            });
        }
        if (!this.page) {
            const context = await this.browser.newContext({
                baseURL: this.options.baseUrl,
            });
            this.page = await context.newPage();
        }
        return this.page;
    }
    async run(test) {
        const page = this.executionMode === "stub" ? null : await this.ensurePage();
        for (const step of test.steps) {
            await this.executeStep(page, step);
        }
    }
    async executeStep(page, step) {
        /* ============================
           STUB EXECUTION MODE
           ============================ */
        if (this.executionMode === "stub") {
            // Intentionally do nothing.
            // Step is considered executed successfully.
            return;
        }
        /* ============================
           REAL PLAYWRIGHT EXECUTION
           ============================ */
        const timeout = step.timeoutMs ?? 10000;
        switch (step.action) {
            case "goto":
                if (!step.target)
                    throw new Error("goto requires target (URL)");
                await page.goto(step.target, { timeout });
                break;
            case "click":
                if (!step.target)
                    throw new Error("click requires target");
                await page.click(step.target, { timeout });
                break;
            case "fill":
                if (!step.target)
                    throw new Error("fill requires target");
                await page.fill(step.target, String(step.value ?? ""), { timeout });
                break;
            case "assertVisible":
                if (!step.target)
                    throw new Error("assertVisible requires target");
                await page.waitForSelector(step.target, {
                    timeout,
                    state: "visible",
                });
                break;
            case "assertText":
                if (!step.target || step.value === undefined) {
                    throw new Error("assertText requires target and value");
                }
                await page.waitForSelector(step.target, { timeout });
                const text = await page.textContent(step.target);
                if (!text?.includes(String(step.value))) {
                    throw new Error(`Expected text "${step.value}" in selector ${step.target}, got "${text}"`);
                }
                break;
            case "waitFor":
                await page.waitForTimeout(Number(step.value) || 1000);
                break;
            default:
                throw new Error(`Unsupported action: ${step.action}`);
        }
    }
    async dispose() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
        }
    }
}
exports.CoreRunner = CoreRunner;
