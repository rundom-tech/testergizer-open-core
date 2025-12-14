import fs from "fs";
import path from "path";
import { chromium, firefox, webkit } from "playwright";
import { validateSuite } from "./validateSuite";
import { runAssertion } from "./assertions";

function sanitizeId(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function formatTimestamp(iso: string): string {
  return iso
    .replace(/[:]/g, "")
    .replace(/\..+/, "")
    .replace("T", "-");
}

export async function runSuiteFromFile(
  suitePath: string,
  options: {
    headed?: boolean;
    slowMo?: number;
    browser?: string;
    screenshotOnFail?: boolean;
    stepRetries?: number;
    retrySteps?: string[];
    retryDelayMs?: number;
  } = {}
) {
  const raw = fs.readFileSync(suitePath, "utf-8");
  const suite = JSON.parse(raw);

  validateSuite(suite);

  const startedAt = new Date().toISOString();

  const suiteId =
    suite.id ||
    suite.suiteId ||
    sanitizeId(suite.suiteName || "suite");

  const browserType =
    options.browser === "firefox"
      ? firefox
      : options.browser === "webkit"
      ? webkit
      : chromium;

  const browser = await browserType.launch({
    headless: !options.headed,
    slowMo: options.slowMo
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  const results: any = {
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
    const testResult: any = {
      id: test.id || null,
      name: test.name,
      status: "passed",
      steps: []
    };

    for (const step of test.steps) {
      if (step.disabled) continue;

      const stepResult: any = {
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
          } else if (step.action === "assert") {
            await runAssertion(page, step);
          }
          break;
        } catch (err: any) {
          stepResult.attemptErrors.push({
            reason: err.name || "error",
            message: err.message || String(err)
          });
          if (attempt === maxRetries) {
            stepResult.status = "failed";
            testResult.status = "failed";
          } else if (options.retryDelayMs) {
            await new Promise(r => setTimeout(r, options.retryDelayMs));
          }
        }
      }

      testResult.steps.push(stepResult);
    }

    results.tests.push(testResult);
    results.summary.total++;
    if (testResult.status === "passed") results.summary.passed++;
    else results.summary.failed++;
  }

  results.endedAt = new Date().toISOString();

  const baseDir = path.join("artifacts", suiteId);
  fs.mkdirSync(baseDir, { recursive: true });

  const ts = formatTimestamp(startedAt);
  const resultsPath = path.join(baseDir, `results_${ts}.json`);

  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2), "utf-8");

  await browser.close();

  console.log(`Results written to ${resultsPath}`);
}
