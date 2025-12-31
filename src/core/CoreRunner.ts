import { chromium, Browser, Page } from "playwright";
import {
  CoreRunnerOptions,
  ExecutionMode,
  JsonTestDefinition,
  JsonStep,
} from "./types";
import { PlaywrightExecutor } from "./executors/PlaywrightExecutor";
import { StepExecutor } from "./executors/StepExecutor";
import { StubExecutor } from "./executors/StubExecutor";
import { StepResult, TestResult, StepError } from "./resultTypes";

function nowIso(): string {
  return new Date().toISOString();
}

function durationMs(startIso: string, endIso: string): number {
  const s = Date.parse(startIso);
  const e = Date.parse(endIso);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 0;
  return Math.max(0, e - s);
}

export class CoreRunner {
  private browser: Browser | null = null;
  private page: Page | null = null;

  private readonly options: CoreRunnerOptions;
  private readonly executionMode: ExecutionMode;
  private readonly executor: StepExecutor;

  constructor(options: CoreRunnerOptions = {}) {
    this.options = options;
    this.executionMode = options.executionMode ?? "stub";

    this.executor = this.executionMode === "stub" ? new StubExecutor() : new PlaywrightExecutor();
  }

  private async ensurePage(): Promise<Page> {
    if (this.executionMode === "stub") {
      throw new Error("ensurePage must not be called in stub execution mode");
    }

    if (!this.browser) {
      this.browser = await chromium.launch({
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

  async run(test: JsonTestDefinition): Promise<TestResult> {
    const testStartedAt = nowIso();

    const page = this.executionMode === "stub" ? null : await this.ensurePage();

    const stepRetries = Math.max(0, Number(this.options.stepRetries ?? 0));
    const retryOnly = Array.isArray(this.options.retryStepIds) && this.options.retryStepIds.length > 0;
    const retrySet = new Set((this.options.retryStepIds ?? []).map(String));
    const retryDelayMs = Math.max(0, Number(this.options.retryDelayMs ?? 0));

    const stepResults: StepResult[] = [];

    let testFailed = false;

    for (const step of test.steps ?? []) {
      const shouldRetryThis = !retryOnly || retrySet.has(step.id);
      const maxAttempts = 1 + (shouldRetryThis ? stepRetries : 0);

      const stepStartedAt = nowIso();
      const errors: StepError[] = [];

      let attempts = 0;
      let stepStatus: "passed" | "failed" = "passed";

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        attempts = attempt;
        try {
          await this.executor.execute(step, page);
          stepStatus = "passed";
          break;
        } catch (err) {
          stepStatus = "failed";
          errors.push(this.toStepError(err));

          if (attempt < maxAttempts && retryDelayMs > 0) {
            await new Promise(res => setTimeout(res, retryDelayMs));
          }
        }
      }

      const stepEndedAt = nowIso();

      const sr: StepResult = {
        id: step.id,
        action: step.action,
        status: stepStatus,
        attempts,
        errors,
        startedAt: stepStartedAt,
        endedAt: stepEndedAt,
        durationMs: durationMs(stepStartedAt, stepEndedAt),
      };

      stepResults.push(sr);

      if (stepStatus === "failed") {
        testFailed = true;
      }
    }

    const testEndedAt = nowIso();

    const tr: TestResult = {
      id: test.id,
      name: test.name,
      testDomain: test.testDomain ?? "system",
      executionMode: this.executionMode,
      status: testFailed ? "failed" : "passed",
      startedAt: testStartedAt,
      endedAt: testEndedAt,
      durationMs: durationMs(testStartedAt, testEndedAt),
      steps: stepResults,
    };

    return tr;
  }

  private toStepError(err: unknown): StepError {
    if (err instanceof Error) {
      return {
        reason: err.name || "Error",
        message: err.message || String(err),
        stack: err.stack,
      };
    }

    return {
      reason: "Error",
      message: typeof err === "string" ? err : JSON.stringify(err),
    };
  }

  async dispose(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}
