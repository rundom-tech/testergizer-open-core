import fs from "fs";
import path from "path";
import { chromium, firefox, webkit } from "playwright";
import { runAssertion } from "./assertions";

export interface RunnerOptions {
  headless?: boolean;
  slowMo?: number;
  browser?: "chromium" | "firefox" | "webkit";
  screenshotOnFail?: boolean;
}

function ensureArtifactsDir(): string {
  const dir = path.resolve(process.cwd(), "artifacts");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeFileName(input: string): string {
  return String(input).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}

export async function runSuiteFromFile(
  suitePath: string,
  options: RunnerOptions = {}
): Promise<boolean> {
  const artifactsDir = ensureArtifactsDir();

  const raw = fs.readFileSync(suitePath, "utf-8");
  const suite = JSON.parse(raw);

  console.log(`Loaded suite: ${suite.suiteName}`);
  console.log(
    `Running in ${options.headless === false ? "headed" : "headless"} mode (${options.browser ?? "chromium"})`
  );

  const results: any = {
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

  const browserType =
    options.browser === "firefox" ? firefox : options.browser === "webkit" ? webkit : chromium;

  let suiteOk = true;

  for (const test of suite.tests ?? []) {
    const testStart = Date.now();
    console.log(`\n=== Test: ${test.name} ===`);

    const browser = await browserType.launch({
      headless: options.headless !== false,
      slowMo: options.slowMo
    });

    const page = await browser.newPage();

    const testResult: any = {
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
              await runAssertion(page, step);
              break;

            default:
              throw new Error(`Unknown action: ${step.action}`);
          }

          testResult.steps.push({
            action: step.action,
            status: "passed",
            durationMs: Date.now() - stepStart
          });
        } catch (stepErr: any) {
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
    } catch (err: any) {
      suiteOk = false;
      testResult.status = "failed";
      testResult.error = String(err?.message ?? err);

      if (options.screenshotOnFail) {
        const file = `${safeFileName(test.id ?? test.name)}-failure.png`;
        const outPath = path.join(artifactsDir, file);
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

  const resultsPath = path.join(artifactsDir, "results.json");
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2), "utf-8");
  console.log(`\nResults written to ${path.relative(process.cwd(), resultsPath)}`);

  console.log(suiteOk ? `✔ Suite passed: ${suite.suiteName}` : `✖ Suite failed: ${suite.suiteName}`);
  return suiteOk;
}
