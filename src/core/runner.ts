import fs from "fs";
import path from "path";
import { chromium, firefox, webkit, BrowserType } from "playwright";
import { validateSuite } from "./validateSuite";
import { runAssertion } from "./assertions";

/**
 * RunnerOptions is part of the internal contract used by the CLI.
 * Both `headed` and `headless` are supported for compatibility.
 */
export interface RunnerOptions {
  headed?: boolean;
  headless?: boolean; // accepted for backward / CLI compatibility
  slowMo?: number;
  browser?: "chromium" | "firefox" | "webkit" | string;
  screenshotOnFail?: boolean;

  // Step retries
  stepRetries?: number;
  retrySteps?: string[];
  retryDelayMs?: number;
}

function sanitizeId(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function formatTimestamp(iso: string): string {
  const noMs = iso.replace(/\..+/, "").replace(/Z$/, "");
  const [date, time] = noMs.split("T");
  return `${date.replace(/-/g, "")}-${time.replace(/:/g, "")}`;
}

function pickBrowserType(name?: string): BrowserType {
  const n = (name || "chromium").toLowerCase();
  if (n === "firefox") return firefox;
  if (n === "webkit") return webkit;
  return chromium;
}

function shouldRetryStep(stepId: string, retrySteps?: string[]): boolean {
  if (!retrySteps || retrySteps.length === 0) return true;
  return retrySteps.includes(stepId);
}

export async function runSuiteFromFile(
  suitePath: string,
  options: RunnerOptions = {}
) {
  const raw = fs.readFileSync(suitePath, "utf-8");
  const suite = JSON.parse(raw);

  validateSuite(suite);

  const startedAt = new Date().toISOString();

  const suiteId =
    suite.id ||
    suite.suiteId ||
    sanitizeId(suite.suiteName || "suite");

  const browserType = pickBrowserType(options.browser);

  // Resolve headless mode safely
  const headless =
    typeof options.headless === "boolean"
      ? options.headless
      : !options.headed;

  const browser = await browserType.launch({
    headless,
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

      const stepId = step.id || "";

      const stepResult: any = {
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
          } else if (step.action === "assert") {
            await runAssertion(page, step);
          } else {
            throw new Error(`Unknown step action: ${step.action}`);
          }
          break;
        } catch (err: any) {
          stepResult.attemptErrors.push({
            reason: err?.name || "error",
            message: err?.message || String(err)
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
