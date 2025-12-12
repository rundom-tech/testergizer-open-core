import fs from "fs";
import path from "path";
import crypto from "crypto";
import { chromium, firefox, webkit } from "playwright";
import { runAssertion } from "./assertions";
import { validateSuite } from "./validateSuite";
import { validateResults } from "./validateResults";
import { classifyRetry } from "./retryClassifier";
import { collectMeta } from "./meta";

export interface RunnerOptions {
  headless?: boolean;
  slowMo?: number;
  browser?: "chromium" | "firefox" | "webkit";
  screenshotOnFail?: boolean;

  stepRetries?: number;
  retryStepIds?: string[];
  retryDelayMs?: number;
}

function ensureArtifactsDir(): string {
  const dir = path.resolve(process.cwd(), "artifacts");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeFileName(input: string): string {
  return String(input).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}

function getStepId(step: any, index: number): string {
  if (step?.id) return String(step.id);
  return `step-${index + 1}`;
}

function shouldRetry(stepId: string, options: RunnerOptions): boolean {
  const retries = options.stepRetries ?? 0;
  if (retries <= 0) return false;
  const allow = options.retryStepIds?.filter(Boolean) ?? [];
  if (allow.length === 0) return true;
  return allow.includes(stepId);
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function resolveTimeoutMs(suite: any, test: any, step: any): number {
  const stepT = step?.timeoutMs ? Number(step.timeoutMs) : undefined;
  if (Number.isFinite(stepT) && stepT! > 0) return stepT!;
  const testT = test?.timeoutMs ? Number(test.timeoutMs) : undefined;
  if (Number.isFinite(testT) && testT! > 0) return testT!;
  const suiteT = suite?.timeoutMs ? Number(suite.timeoutMs) : undefined;
  if (Number.isFinite(suiteT) && suiteT! > 0) return suiteT!;
  return 30000;
}

export async function runSuiteFromFile(suitePath: string, options: RunnerOptions = {}): Promise<boolean> {
  const artifactsDir = ensureArtifactsDir();
  const raw = fs.readFileSync(suitePath, "utf-8");
  const suite = JSON.parse(raw);

  validateSuite(suite);

  const runId = (crypto as any).randomUUID ? (crypto as any).randomUUID() : crypto.randomBytes(16).toString("hex");
  const suiteVersion = typeof suite.version === "string" ? suite.version : "1.0";

  console.log(`Loaded suite: ${suite.suiteName}`);
  console.log(`Suite version: ${suiteVersion}`);
  console.log(`Running in ${options.headless === false ? "headed" : "headless"} mode (${options.browser ?? "chromium"})`);

  const results: any = {
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
    meta: collectMeta(),
    tests: []
  };

  const browserType =
    options.browser === "firefox" ? firefox : options.browser === "webkit" ? webkit : chromium;

  let suiteOk = true;

  const tests = [...(suite.tests ?? [])].sort((a: any, b: any) => {
    const ak = String(a.id ?? a.name ?? "");
    const bk = String(b.id ?? b.name ?? "");
    return ak.localeCompare(bk);
  });

  for (const test of tests) {
    const testStart = Date.now();
    console.log(`\n=== Test: ${test.name} ===`);

    const browser = await browserType.launch({
      headless: options.headless !== false,
      slowMo: options.slowMo
    });

    const page = await browser.newPage();

    const defaultTimeout = resolveTimeoutMs(suite, test, null);
    page.setDefaultTimeout(defaultTimeout);
    page.setDefaultNavigationTimeout(defaultTimeout);

    const consoleLogs: Array<{ type: string; text: string; location?: string }> = [];
    page.on("console", (msg) => {
      try {
        const loc = msg.location();
        const location = loc?.url ? `${loc.url}:${loc.lineNumber}:${loc.columnNumber}` : undefined;
        consoleLogs.push({ type: msg.type(), text: msg.text(), location });
      } catch {
        consoleLogs.push({ type: "log", text: String(msg.text()) });
      }
    });

    const testResult: any = {
      id: test.id ?? null,
      name: test.name,
      status: "passed",
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
        const attemptErrors: Array<{ reason: string; message: string }> = [];
        const maxAttempts = 1 + (options.stepRetries ?? 0);
        const eligible = shouldRetry(stepId, options);
        let attempts = 0;
        let lastErr: any = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          attempts = attempt;
          console.log(`→ Step (${stepId}) [${attempt}/${maxAttempts}]: ${step.action}`);

          try {
            const stepTimeout = resolveTimeoutMs(suite, test, step);

            switch (step.action) {
              case "goto":
                await page.goto(step.url, {
                  waitUntil: step.waitUntil ?? "load",
                  timeout: stepTimeout
                });
                lastErr = null;
                break;

              case "assert":
                await runAssertion(page, { ...step, timeoutMs: stepTimeout });
                lastErr = null;
                break;

              default:
                throw new Error(`Unknown action: ${step.action}`);
            }

            break;
          } catch (err: any) {
            lastErr = err;
            attemptErrors.push({
              reason: classifyRetry(err),
              message: String(err?.message ?? err)
            });

            const isLast = attempt === maxAttempts;
            if (!eligible || isLast) break;

            const d = options.retryDelayMs ?? 0;
            if (d > 0) await delay(d);
          }
        }

        if (lastErr) {
          testResult.steps.push({
            id: stepId,
            action: step.action,
            status: "failed",
            durationMs: Date.now() - stepStart,
            attempts,
            flaky: false,
            error: String(lastErr?.message ?? lastErr),
            attemptErrors
          });
          throw lastErr;
        } else {
          testResult.steps.push({
            id: stepId,
            action: step.action,
            status: "passed",
            durationMs: Date.now() - stepStart,
            attempts,
            flaky: attempts > 1,
            error: null,
            attemptErrors
          });
        }
      }

      console.log(`✔ Test passed: ${test.name}`);
    } catch (err: any) {
      suiteOk = false;
      testResult.status = "failed";
      testResult.error = String(err?.message ?? err);
      testResult.consoleLogs = consoleLogs;

      if (options.screenshotOnFail) {
        const file = `${safeFileName(test.id ?? test.name)}-failure.png`;
        const outPath = __dirname ? path.join(artifactsDir, file) : path.join(artifactsDir, file);
        await page.screenshot({ path: outPath, fullPage: true });
        testResult.screenshot = path.relative(process.cwd(), outPath).replace(/\\/g, "/");
        console.error(`Screenshot saved: ${testResult.screenshot}`);
      }

      console.error(`✖ Test failed: ${test.name}`);
    } finally {
      testResult.durationMs = Date.now() - testStart;
      results.tests.push(testResult);
      await browser.close();
    }
  }

  results.endedAt = new Date().toISOString();
  results.summary = {
    total: results.tests.length,
    passed: results.tests.filter((t: any) => t.status === "passed").length,
    failed: results.tests.filter((t: any) => t.status === "failed").length
  };

  validateResults(results);

  const resultsPath = path.join(artifactsDir, "results.json");
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2), "utf-8");
  console.log(`\nResults written to ${path.relative(process.cwd(), resultsPath)}`);
  console.log(suiteOk ? `✔ Suite passed: ${suite.suiteName}` : `✖ Suite failed: ${suite.suiteName}`);

  return suiteOk;
}
