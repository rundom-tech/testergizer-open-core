// src/core/CoreRunner.ts

import fs from "fs";
import path from "path";
import crypto from "crypto";

import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserType,
  type Page,
  type BrowserContext
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

function isHeadless(options: CoreRunnerOptions): boolean {
  return options.headless ?? true;
}

function safeFileToken(input: string): string {
  return String(input || "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

/**
 * Defensive normalization:
 * yargs / CLI layers sometimes pass numbers as strings.
 * retries must be a non-negative integer count of *additional* attempts.
 */
function normalizeRetries(value: unknown): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.floor(value));
  }

  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return 0;
    const n = Number(t);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.floor(n));
  }

  return 0;
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
  private readonly retries: number;

  constructor(options: CoreRunnerOptions = {}) {
    this.options = options;
    this.executionMode = options.executionMode ?? "stub";
    this.executor =
      this.executionMode === "stub"
        ? new StubExecutor()
        : new PlaywrightExecutor();

    // Retry semantics:
    // - retries = number of *additional* attempts after the first one
    // - maxAttempts = 1 + retries
    // NOTE: retries are disabled for stub mode by policy.
    //
    // IMPORTANT: we normalize here because upstream CLI parsers may supply "2"
    // (string) instead of 2 (number). Without this, retries silently become 0.
    this.retries =
      this.executionMode === "stub"
        ? 0
        : normalizeRetries((options as any).retries);
  }

  /**
   * Execute exactly one test.
   * Owns its browser lifecycle.
   * Retries are handled mechanically.
   */
  async run(test: JsonTestDefinition): Promise<TestResult> {
    const testStartedAt = nowIso();

    const { projectId, browserType } = pickBrowserType(this.options.browserName);

    const attempts: TestAttemptResult[] = [];

    const maxAttempts = 1 + this.retries;

    let finalResult: TestResultValue = "passed";

    for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber++) {
      let browser: Browser | null = null;
      let context: BrowserContext | null = null;
      let page: Page | null = null;

      const stepResults: StepResult[] = [];
      const attemptErrors: StepError[] = [];

      let attemptFailed = false;
      let aborted: StepError | null = null;

      const artifactsEnabled =
        this.options.artifacts?.enabled === true && this.executionMode !== "stub";

      const attemptDir = artifactsEnabled
        ? path.join(
            this.options.artifacts!.dir,
            projectId,
            test.id,
            `attempt-${attemptNumber}`
          )
        : undefined;

      const attemptStartedAt = nowIso();

      try {
        if (this.executionMode !== "stub") {
          browser = await browserType.launch({
            headless: this.options.headless ?? true,
            slowMo: this.options.slowMoMs
          });

          if (attemptDir) {
            await fs.promises.mkdir(attemptDir, { recursive: true });
          }

          context = await browser.newContext({
            baseURL: this.options.baseUrl,
            recordVideo:
              artifactsEnabled &&
              this.options.artifacts?.video === "on-failure" &&
              attemptDir
                ? { dir: attemptDir }
                : undefined
          });

          if (
            artifactsEnabled &&
            this.options.artifacts?.trace === "on-failure"
          ) {
            await context.tracing.start({
              screenshots: true,
              snapshots: true,
              sources: true
            });
          }

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

            if (
              artifactsEnabled &&
              this.options.artifacts?.screenshot === "on-failure" &&
              attemptDir &&
              page
            ) {
              try {
                const shotPath = path.join(
                  attemptDir,
                  `step-${safeFileToken(step.id)}-failure.png`
                );
                await page.screenshot({ path: shotPath, fullPage: true });

                this.options.artifactObserver?.append({
                  id: crypto.randomUUID(),
                  type: "screenshot",
                  observedAt: nowIso(),
                  execution: {
                    testId: test.id,
                    attempt: attemptNumber,
                    stepId: step.id,
                    browser: projectId,
                    mode: isHeadless(this.options) ? "headless" : "headed",
                    projectId
                  },
                  scope: "step",
                  trigger: "failure",
                  artifact: {
                    path: shotPath,
                    producer: "playwright"
                  }
                });
              } catch {
                // Evidence capture must not throw.
              }
            }
          }

          const stepEndedAt = nowIso();

          // Normalize compiler/runtime passthroughs into report-friendly shapes.
          const normalizedTarget = (() => {
            const t: any = (step as any).target;
            if (t === undefined || t === null) return undefined;
            if (typeof t === "string") return { value: t, resolved: true };
            if (typeof t === "object" && typeof t.value === "string") {
              return { value: t.value, resolved: t.resolved !== false };
            }
            // Fallback (do not throw in reporter path)
            return { value: String(t), resolved: true };
          })();

          const normalizedData = (() => {
            const d: any = (step as any).data;
            if (d && typeof d === "object" && "value" in d) return d;

            const v: any = (step as any).value ?? (step as any).input;
            if (v === undefined) return undefined;

            return { value: v, masked: false };
          })();

          stepResults.push({
            id: step.id,
            action: step.action,

            // 🔽 REQUIRED passthroughs (compiler → runtime → report)
            group: (step as any).group,
            target: normalizedTarget,
            data: normalizedData,

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
        // Trace stop must happen before context is closed.
        if (
          context &&
          artifactsEnabled &&
          this.options.artifacts?.trace === "on-failure"
        ) {
          try {
            if (attemptFailed && attemptDir) {
              const tracePath = path.join(attemptDir, "trace.zip");
              await context.tracing.stop({ path: tracePath });

              this.options.artifactObserver?.append({
                id: crypto.randomUUID(),
                type: "trace",
                observedAt: nowIso(),
                execution: {
                  testId: test.id,
                  attempt: attemptNumber,
                  browser: projectId,
                  mode: isHeadless(this.options) ? "headless" : "headed",
                  projectId
                },
                scope: "test",
                trigger: "failure",
                artifact: {
                  path: tracePath,
                  producer: "playwright"
                }
              });
            } else {
              await context.tracing.stop();
            }
          } catch {
            // Evidence capture must not throw.
          }
        }

        // Close context to flush video files.
        const video = page?.video?.();

        if (context) {
          try {
            await context.close();
          } catch {
            // ignore
          }
        }

        // Video path is only reliably available after close.
        if (
          video &&
          artifactsEnabled &&
          this.options.artifacts?.video === "on-failure" &&
          attemptFailed
        ) {
          try {
            const videoPath = await video.path();
            this.options.artifactObserver?.append({
              id: crypto.randomUUID(),
              type: "video",
              observedAt: nowIso(),
              execution: {
                testId: test.id,
                attempt: attemptNumber,
                browser: projectId,
                mode: isHeadless(this.options) ? "headless" : "headed",
                projectId
              },
              scope: "test",
              trigger: "failure",
              artifact: {
                path: videoPath,
                producer: "playwright"
              }
            });
          } catch {
            // ignore
          }
        }

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

      // failed: only stop after last attempt; otherwise retry mechanically
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
