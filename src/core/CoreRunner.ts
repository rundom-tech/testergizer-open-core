// src/core/CoreRunner.ts

import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserType,
  type Page
} from "playwright";

import type {
  CoreRunnerOptions,
  ExecutionMode,
  JsonTestDefinition,
  JsonStep
} from "./types";

import { PlaywrightExecutor } from "./executors/PlaywrightExecutor";
import type { StepExecutor } from "./executors/StepExecutor";
import { StubExecutor } from "./executors/StubExecutor";

import type {
  StepError,
  StepResult,
  StepStatus,
  TestResult,
  TestResultValue,
  TestAttemptResult,
  InstrumentationState,
  CacheState
} from "./resultTypes";

function nowIso(): string {
  return new Date().toISOString();
}

function durationMs(startIso: string, endIso: string): number {
  const s = Date.parse(startIso);
  const e = Date.parse(endIso);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 0;
  return Math.max(0, e - s);
}

function pickBrowserType(name?: string): {
  projectId: string;
  browserType: BrowserType;
} {
  const n = (name || "chromium").toLowerCase();
  if (n === "firefox") return { projectId: "firefox", browserType: firefox };
  if (n === "webkit") return { projectId: "webkit", browserType: webkit };
  return { projectId: "chromium", browserType: chromium };
}

/**
 * Pure helper: compute instrumentation facts per attempt.
 * No policy inference, only explicit rules.
 */
function instrumentationForAttempt(
  executionMode: ExecutionMode,
  attemptNumber: number
): InstrumentationState | undefined {
  if (executionMode === "stub") return undefined;

  const enabled = attemptNumber > 1;

  return {
    video: { enabled },
    snapshot: { enabled },
    domSnapshot: { enabled }
  };
}

export class CoreRunner {
  private readonly options: CoreRunnerOptions;
  private readonly executionMode: ExecutionMode;
  private readonly executor: StepExecutor;

  constructor(options: CoreRunnerOptions = {}) {
    this.options = options;
    this.executionMode = options.executionMode ?? "stub";
    this.executor =
      this.executionMode === "stub"
        ? new StubExecutor()
        : new PlaywrightExecutor();
  }

  /**
   * Execute exactly one test.
   * Owns its browser lifecycle.
   * Retries are handled mechanically.
   */
  async run(test: JsonTestDefinition): Promise<TestResult> {
    const testStartedAt = nowIso();

    const { projectId, browserType } = pickBrowserType(
      this.options.browserName
    );

    const attempts: TestAttemptResult[] = [];

    const maxAttempts =
      this.executionMode === "stub"
        ? 1
        : Math.max(1, this.options.retries ?? 1);

    let finalResult: TestResultValue = "passed";

    for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber++) {
      let browser: Browser | null = null;
      let page: Page | null = null;

      const stepResults: StepResult[] = [];
      const attemptErrors: StepError[] = [];

      let attemptFailed = false;
      let aborted: StepError | null = null;

      const attemptStartedAt = nowIso();

      try {
        if (this.executionMode !== "stub") {
          browser = await browserType.launch({
            headless: this.options.headless ?? true,
            slowMo: this.options.slowMoMs
          });

          const context = await browser.newContext({
            baseURL: this.options.baseUrl
          });

          page = await context.newPage();
        }

        for (const step of test.steps ?? []) {
          const stepStartedAt = nowIso();
          const errors: StepError[] = [];
          let status: StepStatus = "passed";

          try {
            await this.executor.execute(step as JsonStep, page);
          } catch (err) {
            status = "failed";
            errors.push(this.toStepError(err));
            attemptFailed = true;
          }

          const stepEndedAt = nowIso();

          stepResults.push({
            id: step.id,
            action: step.action,
            status,
            attempts: 1,
            errors,
            startedAt: stepStartedAt,
            endedAt: stepEndedAt,
            durationMs: durationMs(stepStartedAt, stepEndedAt)
          });
        }
      } catch (err) {
        aborted = this.toStepError(err);
        attemptErrors.push(aborted);
      } finally {
        if (browser) {
          try {
            await browser.close();
          } catch (err) {
            if (!aborted) {
              aborted = this.toStepError(err);
              attemptErrors.push(aborted);
            }
          }
        }
      }

      const attemptEndedAt = nowIso();

      const attemptResult: TestResultValue = aborted
        ? "aborted"
        : attemptFailed
        ? "failed"
        : "passed";

      const instrumentation = instrumentationForAttempt(
        this.executionMode,
        attemptNumber
      );

      const cache: CacheState | undefined =
        this.executionMode === "stub"
          ? undefined
          : {
              mode: "enabled",
              state: "cold",
              scope: "browser"
            };

      attempts.push({
        attempt: attemptNumber,
        result: attemptResult,
        startedAt: attemptStartedAt,
        endedAt: attemptEndedAt,
        durationMs: durationMs(attemptStartedAt, attemptEndedAt),
        instrumentation,
        cache,
        errors: attemptErrors.length ? attemptErrors : undefined,
        steps: stepResults
      });

      if (attemptResult === "passed") {
        finalResult = "passed";
        break;
      }

      if (attemptResult === "aborted") {
        finalResult = "aborted";
        break;
      }

      finalResult = "failed";
    }

    const testEndedAt = nowIso();

    return {
      id: test.id,
      name: test.name,
      testDomain: test.testDomain ?? "system",
      executionMode: this.executionMode,
      projectId,
      result: finalResult,
      startedAt: testStartedAt,
      endedAt: testEndedAt,
      durationMs: durationMs(testStartedAt, testEndedAt),
      attempts
    };
  }

  async dispose(): Promise<void> {
    // no-op by design
  }

  private toStepError(err: unknown): StepError {
    if (err instanceof Error) {
      return {
        reason: err.name || "Error",
        message: err.message,
        stack: err.stack
      };
    }

    return {
      reason: "Error",
      message: typeof err === "string" ? err : JSON.stringify(err)
    };
  }
}
