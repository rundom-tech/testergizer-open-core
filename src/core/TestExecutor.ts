// src/core/TestExecutor.ts
import { ExecutionContext } from "./context/ExecutionContext";
import { VarianceResolver } from "./context/VarianceResolver";
import { evaluateVersionCompatibility } from "./locators/ctrVersionGuard";
import { evaluateDomFingerprint } from "./locators/ctrDomGuard";

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
  TestExecutorOptions as TestExecutorOptions,
  ExecutionEngine,
  ExecutionIntent,
  ValidationMode,
  JsonTestDefinition,
  JsonStep
} from "./types";

import { PlaywrightExecutor } from "./executors/PlaywrightExecutor";
import type { StepExecutor } from "./executors/StepExecutor";
import { TestergizerExecutor } from "./executors/TestergizerExecutor";

import type {
  StepError,
  StepResult,
  StepStatus,
  TestResult,
  TestResultValue,
  TestAttemptResult,
  InstrumentationState,
  CacheState,
  StepWarning,
  RunSummary
} from "./resultTypes";

import { loadCTRFromFile } from "./locators/ctrLoader";
import { CTRDefinition } from "./locators/ctrDefinition";

import { LocatorRepository } from "./locators/repository";
import { resolveLocator } from "./locators/resolver";
import { parseTarget } from "./locators/target";
import { ClrSelector } from "./locators/types";

// Replace the old CentralTargetRegistry import with this:
import { ApiTargetRegistry } from "./api/ApiRepository";
import { ApiExecutable, ApiTargetDefinition } from "./api/types";
import { ApiExecutor } from "./executors/ApiExecutor";

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

function isHeadless(options: TestExecutorOptions): boolean {
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
  executionEngine: ExecutionEngine,
  attemptNumber: number
): InstrumentationState | undefined {
  // Semantic fix: API and Model engines do not support UI-based instrumentation
  if (executionEngine === "api" || executionEngine === "testergizer") {
    return undefined;
  }

  const enabled = attemptNumber > 1;

  return {
    video: { enabled },
    snapshot: { enabled },
    domSnapshot: { enabled }
  };
}

export class TestExecutor {
  private readonly options: TestExecutorOptions;
  private readonly engine: ExecutionEngine;
  private readonly executor: StepExecutor;
  private readonly retries: number;

  private autVersion?: string;
  private ctrDefinition?: CTRDefinition;
  private ctrResolution?: any;
  private ctrInitialized = false;
  private locatorRepo?: LocatorRepository;

  private apiExecutable?: ApiExecutable;
  private apiRepo?: ApiTargetRegistry; 
  

  constructor(options: TestExecutorOptions = {}) {
    this.options = options;

    this.engine = options.executionEngine ?? "testergizer";

    this.executor =
      this.engine === "testergizer"
        ? new TestergizerExecutor()
        : new PlaywrightExecutor();

    this.retries =
      this.engine === "testergizer"
        ? 0
        : normalizeRetries((options as any).retries);

    this.autVersion = options.autVersion;
  }

  private async initCTR(): Promise<void> {
    if (this.ctrInitialized) return;

    if (!this.ctrDefinition) {
      this.ctrInitialized = true;
      return;
    }

    const autVersion =
      this.autVersion ??
      (this.engine === "testergizer" ? "demo" : undefined);

    if (this.engine !== "testergizer" && !autVersion) {
      throw new Error(
        "CTR_REQUIRED: autVersion must be provided for live execution"
      );
    }

    const ctrDef = this.ctrDefinition;

    const detectedAutVersion = autVersion ?? "demo";

    const versionCheck = evaluateVersionCompatibility(ctrDef, {
      executionEngine: this.engine,
      executionIntent: this.options.executionIntent ?? "verify",
      validationMode: this.options.validationMode ?? "strict",
      detectedAutVersion,
      detectedDomFingerprint: undefined
    });

    if (versionCheck.status === "out_of_range") {
      throw new Error(
        `CTR_VERSION_MISMATCH: appId=${ctrDef.appId} autVersion=${detectedAutVersion} range=${ctrDef.versionRange}`
      );
    }

    const domCheck = evaluateDomFingerprint(
      ctrDef.domFingerprint,
      {
        executionEngine: this.engine,
        executionIntent: this.options.executionIntent ?? "verify",
        validationMode: this.options.validationMode ?? "strict",
        detectedAutVersion,
        detectedDomFingerprint: undefined
      }
    );

    if (domCheck.status === "drift") {
      throw new Error(
        `CTR_DOM_DRIFT: appId=${ctrDef.appId} autVersion=${detectedAutVersion}`
      );
    }

    this.ctrResolution = {
      appId: ctrDef.appId,
      versionRange: ctrDef.versionRange,
      detectedAutVersion,
      versionCheck
    };

    this.ctrInitialized = true;
  }

  private async initAPIRepo(): Promise<void> {
    this.apiRepo = new ApiTargetRegistry(); 
    
    const injectedCtr = 
      (this as any).ctrDefinition || 
      (this as any).clrDefinition || 
      (this.options as any).ctrDefinition || 
      (this.options as any).clrDefinition;
    
    if (injectedCtr) {
      this.apiRepo.loadFromObject(injectedCtr);
    }
  }

  async execute(test: JsonTestDefinition): Promise<TestResult> {
    const testStartedAt = nowIso();

    await this.initCTR();
    await this.initAPIRepo();

    // Initialize execution context for Sprint 3
    const initialVariables = (this.options as any).variables || {};
    const executionContext = new ExecutionContext(initialVariables);
    const varianceResolver = new VarianceResolver(executionContext);

    const { projectId: baseProjectId, browserType } = pickBrowserType(this.options.browserName);
    
    const projectId = this.engine === "api" ? "rest-api" : baseProjectId;

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

      const isModelEngine = this.engine === "testergizer";
      
      const artifactsEnabled =
        this.options.artifacts?.enabled === true &&
        this.engine === "playwright";

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
        if (this.engine === "playwright") {
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
          const rawTargetBefore: any = (step as any).target;

          // SPRINT 3: Resolve Variance on Target and Data BEFORE domain execution
          if (typeof (step as any).target === 'string') {
            (step as any).target = varianceResolver.resolveString((step as any).target);
          }
          if ((step as any).data) {
            (step as any).data = varianceResolver.resolveObject((step as any).data);
          } else if ((step as any).value) {
            (step as any).value = varianceResolver.resolveObject((step as any).value);
          } else if ((step as any).input) {
            (step as any).input = varianceResolver.resolveObject((step as any).input);
          }

          const errors: StepError[] = [];
          let status: StepStatus = isModelEngine ? "reviewed" : "passed";

          try {
            if (
              this.engine === "playwright" &&
              this.ctrDefinition &&
              typeof (step as any).target === "string"
            ) {
              const action = String((step as any).action);

              const needsSelector =
                action === "click" ||
                action === "fill" ||
                action === "assertVisible" ||
                action === "assertText";

              if (needsSelector) {
                const logicalTarget = String((step as any).target);

                const looksLogical =
                  logicalTarget.split(".").length === 3 &&
                  !logicalTarget.includes("://");

                if (looksLogical) {
                  if (!this.locatorRepo) {
                    this.locatorRepo = LocatorRepository.fromDictionary(
                      (this.ctrDefinition as any).locators
                    );
                  }

                  const parsed = parseTarget(logicalTarget);
                  const def = this.locatorRepo.get(parsed.elementKey);

                  if (!def) {
                    throw new Error(
                      `CTR element "${parsed.elementKey}" not found. Available keys: ${this.locatorRepo.keys().join(", ")}`
                    );
                  }

                  const res = await resolveLocator(
                    parsed.elementKey,
                    def,
                    parsed.context,
                    {
                      tryResolve: async (s: ClrSelector) => {
                        if (!page) return null;

                        if (s.using === "css") {
                          const h = await page.$(s.value);
                          return h ? {} : null;
                        }

                        if (s.using === "xpath") {
                          const selector = `xpath=${s.value}`;
                          const h = await page.$(selector);
                          return h ? {} : null;
                        }

                        return null;
                      }
                    }
                  );

                  if (!res.resolved || !res.resolvedBy) {
                    throw new Error(`Failed to resolve CTR target: ${logicalTarget}`);
                  }

                  (step as any).target =
                    res.resolvedBy.using === "xpath"
                      ? `xpath=${res.resolvedBy.value}`
                      : res.resolvedBy.value;
                }
              }
            }

            if ((step.action as string) === "api-call") {
              
              if (!this.apiRepo) {
                this.apiRepo = new ApiTargetRegistry(); 
              }
              
              const possibleSources = [
                (this as any).ctrDefinition,
                (this as any).clrDefinition,
                (this.options as any)?.ctrDefinition,
                (this.options as any)?.clrDefinition
              ];

              const validCtr = possibleSources.find(source => source && source.endpoints);

              if (validCtr && (this.apiRepo as any).endpointsMap?.size === 0) {
                this.apiRepo!.loadFromObject(validCtr); 
              }

              const targetStr = String((step as any).target);
              
              if (!this.apiRepo!.getEndpoint(targetStr)) {
                const keys = Array.from((this.apiRepo as any).endpointsMap?.keys() || []).join(", ");
                throw new Error(`[API Routing] Target '${targetStr}' missing. Available keys: [${keys}]`);
              }
              
              const apiEngine = new ApiExecutor(this.apiRepo!);
              const apiResponse = await apiEngine.execute({
                id: step.id,
                version: "2.0",
                targetRef: targetStr,
                method: (step as any).method || "GET",
                payload: (step as any).payload,
                assertions: (step as any).assertions || [] 
              } as ApiExecutable, initialVariables); 
              
              // 1. Correctly map the Payload into the Step's data object
              (step as any).target = { value: apiResponse.url, resolved: true };
              (step as any).data = { 
                value: apiResponse.status_code, 
                body: apiResponse.body,
                headers: apiResponse.headers,
                masked: false 
              };
              
              if (apiResponse.passed) {
                status = "passed"; 
              } else {
                status = "failed";
                attemptFailed = true; 
                errors.push({
                  reason: "AssertionFailure",
                  message: apiResponse.assertionErrors.join(' \n ')
                });
              }

            } else {
              await this.executor.execute(step as JsonStep, page);
            }

          } catch (err) {
            if (!isModelEngine) {
              status = "failed";
              attemptFailed = true;
            }
            errors.push(this.toStepError(err));

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
                // ignore
              }
            }
          }

          const stepEndedAt = nowIso();

          const normalizedTarget: StepResult["target"] = (() => {
            const post: any = (step as any).target;
            const pre: any = rawTargetBefore;

            const normalizePostValue = (): { value: string; resolved: boolean } | undefined => {
              if (post === undefined || post === null) return undefined;
              if (typeof post === "string") return { value: post, resolved: true };
              if (typeof post === "object" && typeof post.value === "string") {
                return { value: post.value, resolved: post.resolved !== false };
              }
              return { value: String(post), resolved: true };
            };

            const nv = normalizePostValue();
            if (!nv) return undefined;

            const logicalCandidate = typeof pre === "string" ? pre : undefined;
            const ctrLocators: any = (this.ctrDefinition as any)?.locators;
            const ctrEntry: any = logicalCandidate && ctrLocators ? ctrLocators[logicalCandidate] : undefined;

            if (!ctrEntry) {
              return { value: nv.value, resolved: nv.resolved };
            }

            const selectors: any[] = Array.isArray(ctrEntry.selectors) ? ctrEntry.selectors : [];
            const matchIdx = selectors.findIndex((s) => s && typeof s.value === "string" && s.value === nv.value);

            if (selectors.length === 0) {
              return {
                ...(logicalCandidate ? { logical: logicalCandidate } : {}),
                value: nv.value,
                resolved: nv.resolved
              };
            }

            if (matchIdx >= 0) {
              const attempted = selectors.slice(0, matchIdx + 1);
              return {
                ...(logicalCandidate ? { logical: logicalCandidate } : {}),
                value: nv.value,
                resolved: true,
                resolvedBy: {
                  using: String(attempted[attempted.length - 1].using),
                  value: String(attempted[attempted.length - 1].value)
                },
                attempts: attempted.map((s, i) => {
                  const result: "success" | "not_found" =
                    i === attempted.length - 1 ? "success" : "not_found";

                  return {
                    using: String(s.using),
                    value: String(s.value),
                    result
                  };
                })
              };
            }

            return {
              ...(logicalCandidate ? { logical: logicalCandidate } : {}),
              value: nv.value,
              resolved: false,
              attempts: selectors.map((s) => ({
                using: String(s.using),
                value: String(s.value),
                result: "not_found"
              }))
            };
          })();

          // 2. Ensure the full data object (including body) is preserved for the reporter
          const normalizedData = (() => {
            const d: any = (step as any).data;
            if (d && typeof d === "object" && "value" in d) {
               return d; // Return the entire object so body/headers are passed through
            }

            const v: any = (step as any).value ?? (step as any).input;
            if (v === undefined) return undefined;

            return { value: v, masked: false };
          })();

          stepResults.push({
            id: step.id,
            action: step.action,
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
            // ignore
          }
        }

        const video = page?.video?.();

        if (context) {
          try {
            await context.close();
          } catch {
            // ignore
          }
        }

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

      const attemptResult: TestResultValue =
        aborted
          ? "aborted"
          : isModelEngine
          ? "reviewed"
          : attemptFailed
          ? "failed"
          : "passed";

      const instrumentation = instrumentationForAttempt(
        this.engine,
        attemptNumber
      );

      const cache: CacheState | undefined =
        this.engine === "api" || this.engine === "testergizer"
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

      if (attemptResult === "aborted") {
        finalResult = "aborted";
        break;
      }

      if (isModelEngine) {
        finalResult = "reviewed";
        break;
      }

      if (attemptResult === "passed") {
        finalResult = "passed";
        break;
      }

      finalResult = "failed";
    }

    const testEndedAt = nowIso();

    return {
      id: test.id,
      name: test.name,
      testDomain: test.testDomain ?? "system",
      projectId,
      result: finalResult,
      startedAt: testStartedAt,
      endedAt: testEndedAt,
      durationMs: durationMs(testStartedAt, testEndedAt),
      attempts
    };
  }

  async dispose(): Promise<void> {
    // no-op
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