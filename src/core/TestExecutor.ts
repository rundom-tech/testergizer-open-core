// src/core/TestExecutor.ts
import { ExecutionContext } from "./context/ExecutionContext";
import { VarianceResolver } from "./context/VarianceResolver";
import { evaluateVersionCompatibility } from "./ctr/ctrVersionGuard";
import { evaluateDomFingerprint } from "./ctr/ctrDomGuard";
import { CCTRManager } from "./ctr/CCTRManager";
import { CTRLoader } from "./ctr/CTRLoader";

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
import { TargetHydrator } from "./executors/TargetHydrator";

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

import { CTRDefinition } from "./ctr/ctrDefinition";

import { LocatorRepository } from "./ctr/ctrRepository";
import { resolveLocator } from "./ctr/ctrResolver";
import { parseTarget } from "./ctr/ctrTargetParser";

import { ApiTargetRegistry } from "./api/ApiRepository";
import { ApiExecutable } from "./api/types";
import { ApiExecutor } from "./executors/ApiExecutor";

// SPRINT 6: New Core Stubs for DB and Email
import { DbExecutor } from "./executors/DbExecutor";
import { EmailExecutor } from "./executors/EmailExecutor";
// SPRINT 8: File System Capabilities
import { FSExecutor } from "./executors/FSExecutor";

// SPRINT 6: Bitwise Domain Flags (31-Bit Power of Two)
export enum TestDomainFlag {
  UI    = 1,  // 00001
  API   = 2,  // 00010
  FS    = 4,  // 00100
  DB    = 8,  // 01000
  EMAIL = 16  // 10000
}

/**
 * Parses human-readable domain strings/arrays into a bitwise integer.
 * Falls back to the execution engine's default domain if missing.
 */
export function resolveTestDomain(input: unknown, engine?: string): number {
  let mask = 0;

  // 1. Explicit Test-Level Override (Highest Priority)
  if (input) {
    let domains: string[] = [];

    if (typeof input === 'number') return Math.floor(input);

    if (typeof input === 'string') {
      if (input.toLowerCase() === 'system') {
        return TestDomainFlag.UI | TestDomainFlag.API;
      }
      domains = input.split(/[\s,|+]+/);
    } else if (Array.isArray(input)) {
      domains = input;
    }

    for (const d of domains) {
      if (typeof d !== 'string') continue;
      const normalized = d.trim().toUpperCase();
      if (normalized === 'UI') mask |= TestDomainFlag.UI;
      if (normalized === 'API') mask |= TestDomainFlag.API;
      if (normalized === 'FS') mask |= TestDomainFlag.FS;
      if (normalized === 'DB') mask |= TestDomainFlag.DB;
      if (normalized === 'EMAIL') mask |= TestDomainFlag.EMAIL;
    }
    
    // If the author provided a valid string that parsed correctly, return it
    if (mask > 0) return mask;
  }

  // 2. Suite-Level Fallback (Inferred Risk)
  if (engine === "playwright") return TestDomainFlag.UI;
  if (engine === "api") return TestDomainFlag.API;
  
  // 3. Absolute Fallback (for explicitly undefined engines)
  return 0;
}

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

  // SPRINT 6: Open Core Executors
  private dbExecutor = new DbExecutor();
  private emailExecutor = new EmailExecutor();
  // SPRINT 8: File System Executor
  private fsExecutor = new FSExecutor();

  // Proactive Obstacle Clearance Infrastructure
  private cctrManager: CCTRManager;
  private loader: CTRLoader;

  constructor(options: TestExecutorOptions = {}) {
    this.options = options;
    this.engine = options.executionEngine ?? "testergizer";

    this.cctrManager = new CCTRManager();
    this.loader = new CTRLoader(this.cctrManager);

    this.executor =
      this.engine === "testergizer"
        ? new TestergizerExecutor()
        : new PlaywrightExecutor(this.cctrManager);

    this.retries =
      this.engine === "testergizer"
        ? 0
        : normalizeRetries((options as any).retries);

    this.autVersion = options.autVersion;

    // SPRINT 6 FIX: Map the CTR definition from options so logical locators resolve
    this.ctrDefinition = (options as any).ctrDefinition || (options as any).clrDefinition;
  }

  // SPRINT 6: Unified Domain Handler
  private async handleDomainStep(executor: any, step: any) {
    return await executor.execute(step);
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

    // Load Federated Registries if configuration exists in options
    const cctrConfig = (this.options as any).cctr;
    if (cctrConfig) {
      await this.loader.loadFederatedRegistries({
        sdrPath: cctrConfig.localPath,
        globalUrl: cctrConfig.globalUrl
      });
    }

    const initialVariables = (this.options as any).variables || {};
    const executionContext = new ExecutionContext(initialVariables);
    const varianceResolver = new VarianceResolver(executionContext);

    const { projectId: baseProjectId, browserType } = pickBrowserType(this.options.browserName);
    
    const projectId = this.engine === "api" ? "rest-api" : baseProjectId;

    const attempts: TestAttemptResult[] = [];
    const maxAttempts = 1 + this.retries;

    let finalResult: TestResultValue = "passed";
    let lastTestDomainValue = 0;

    for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber++) {
      let browser: Browser | null = null;
      let context: BrowserContext | null = null;
      let page: Page | null = null;

      const stepResults: StepResult[] = [];
      const attemptErrors: StepError[] = [];

      let attemptFailed = false;
      let aborted: StepError | null = null;

      const isModelEngine = this.engine === "testergizer";
      
      const testDomainValue = resolveTestDomain(test.testDomain, this.engine);
      lastTestDomainValue = testDomainValue; 
      
      const requiresBrowser = 
        this.engine === "playwright" || 
        (testDomainValue & TestDomainFlag.UI) === TestDomainFlag.UI; 
      
      const artifactsEnabled =
        this.options.artifacts?.enabled === true &&
        requiresBrowser;

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
        let resolvedDownloadPath: string | undefined = undefined;
        let pendingDownloads: Promise<void>[] = [];

        if (requiresBrowser) {
          if (this.ctrDefinition && (this.ctrDefinition as any).paths && (this.ctrDefinition as any).paths["maestro-downloads-dir"]) {
            const rawPath = (this.ctrDefinition as any).paths["maestro-downloads-dir"].value;
            resolvedDownloadPath = varianceResolver.resolveString(rawPath);
          }

          if (resolvedDownloadPath && !fs.existsSync(resolvedDownloadPath)) {
            await fs.promises.mkdir(resolvedDownloadPath, { recursive: true });
          }

          browser = await browserType.launch({
            headless: isHeadless(this.options),
            slowMo: this.options.slowMoMs
          });

          context = await browser.newContext({
            baseURL: this.options.baseUrl,
            acceptDownloads: true,
          });

          if (resolvedDownloadPath) {
            (context as any).on('download', (download: any) => {
              const savePath = path.join(resolvedDownloadPath!, download.suggestedFilename());
              const savePromise = download.saveAs(savePath).then(() => {
                console.log(`[Playwright] Download completed and serialized: ${savePath}`);
              }).catch((err: any) => {
                console.error(`[Playwright] Failed to save download: ${err}`);
              });
              pendingDownloads.push(savePromise);
            });
          }

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
            const actionStr = String((step as any).action || "").toLowerCase();

            if (actionStr.startsWith("db-")) {
              const res = await this.handleDomainStep(this.dbExecutor, step);
              status = res.status as StepStatus || "passed";
              (step as any).data = res.data;
              (step as any).target = { value: step.target, resolved: true };

            } else if (actionStr.startsWith("email-")) {
              const res = await this.handleDomainStep(this.emailExecutor, step);
              status = res.status as StepStatus || "passed";
              (step as any).data = res.data;
              (step as any).target = { value: step.target, resolved: true };

            } else if (actionStr.startsWith("file-") || actionStr.startsWith("dir-")) {
              status = "passed";
              (step as any).data = {
                value: "CORE_STUB",
                audit: [{ check: step.action, path: step.target, passed: true, detail: "[Open Core] FS action recognized." }]
              };
              (step as any).target = { value: step.target, resolved: true };

            } else if (actionStr.startsWith("fs.")) {
              const rawTarget = String((step as any).target);
              
              if (this.ctrDefinition && (this.ctrDefinition as any).paths && (this.ctrDefinition as any).paths[rawTarget]) {
                const ctrPathObj = (this.ctrDefinition as any).paths[rawTarget];
                (step as any).target = varianceResolver.resolveString(ctrPathObj.value);
              }
              
              await this.fsExecutor.execute(step as JsonStep, page, executionContext);
              status = "passed";
              (step as any).target = { value: step.target, resolved: true };

            } else if (actionStr === "api-call" || actionStr.startsWith("api-")) {
              if (isModelEngine) {
                status = "reviewed";
                (step as any).target = { value: String((step as any).target), resolved: true };
                (step as any).data = {
                  value: 200, 
                  body: {},
                  headers: {},
                  extracted: {},
                  audit: [{ check: "model_review", path: "N/A", passed: true, detail: "API payload reviewed" }],
                  masked: false
                };
              } else {
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
                  assertions: (step as any).assertions || [],
                  extract: (step as any).extract 
                } as any, initialVariables, executionContext); 
                
                (step as any).target = { value: apiResponse.url, resolved: true };
                (step as any).data = { 
                  value: apiResponse.status_code, 
                  body: apiResponse.body,
                  headers: apiResponse.headers,
                  extracted: apiResponse.extracted, 
                  audit: apiResponse.audit,         
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
              }

            } else {
              if (
                requiresBrowser && 
                this.ctrDefinition &&
                typeof (step as any).target === "string"
              ) {
                const action = String((step as any).action);
  
                const needsSelector =
                  action === "click" ||
                  action === "fill" ||
                  action === "assertVisible" ||
                  action === "assertText" ||
                  action === "waitFor";
  
                if (needsSelector) {
                  const logicalTarget = String((step as any).target);
  
                  const isUnmanaged =
                    logicalTarget.startsWith("css=") ||
                    logicalTarget.startsWith("xpath=") ||
                    logicalTarget.startsWith("id=") ||
                    logicalTarget.startsWith("data-test=");
                  
                  let rawTargetToHydrate = logicalTarget;
  
                  if (!isUnmanaged) {
                    if (!this.locatorRepo) {
                      this.locatorRepo = LocatorRepository.fromDictionary(
                        (this.ctrDefinition as any).locators || {}
                      );
                    }
  
                    const parsed = parseTarget(logicalTarget);
                    const def = this.locatorRepo.get(parsed.elementKey);
  
                    if (!def) {
                      throw new Error(
                        `Strict Boundary Violation - Locator '${parsed.elementKey}' could not be resolved in the Central Target Registry.`
                      );
                    }
  
                    const res = resolveLocator(
                      parsed.elementKey,
                      def,
                      parsed.context !== "global" ? parsed.context : undefined
                    );
  
                    if (!res.resolved || !res.resolvedBy) {
                      throw new Error(`Strict Boundary Violation - Locator '${parsed.elementKey}' failed to yield a valid selector.`);
                    }
  
                    rawTargetToHydrate =
                      res.resolvedBy.using === "xpath"
                        ? `xpath=${res.resolvedBy.value}`
                        : res.resolvedBy.value; 
                  }
                  
                  // Hydrate the locator with test inputs + context state
                  const stateDict = { ...executionContext.getVariables(), ...(test as any).inputs };
                  (step as any).target = TargetHydrator.hydrateLocator(rawTargetToHydrate, stateDict);
                }
              }

              await this.executor.execute(step as JsonStep, page);

              if (pendingDownloads.length > 0) {
                await Promise.all(pendingDownloads);
                pendingDownloads = []; 
              }

              if (page && (step as any).extract && Array.isArray((step as any).extract) && status === "passed") {
                const targetSelector = typeof (step as any).target === 'string' ? (step as any).target : undefined;
                
                for (const instr of (step as any).extract) {
                  let extractedValue: any = undefined;
                  
                  if (targetSelector) {
                    const locator = page.locator(targetSelector).first();
                    try {
                      if (instr.property) {
                        extractedValue = await locator.evaluate((el: any, prop: string) => el[prop], instr.property);
                      } else if (instr.attribute) {
                        extractedValue = await locator.getAttribute(instr.attribute);
                      }
                    } catch (e) {
                      console.warn(`[UI Extractor] DOM extraction failed for ${targetSelector}:`, e);
                    }
                  }
                  
                  if (extractedValue !== undefined && extractedValue !== null) {
                    executionContext.set(instr.as, extractedValue, instr.transform);
                    console.log(`[UI Extractor] Captured "${instr.as}" =`, extractedValue);
                    
                    if (!(step as any).data) (step as any).data = {};
                    if (!(step as any).data.extracted) (step as any).data.extracted = {};
                    (step as any).data.extracted[instr.as] = extractedValue;
                  }
                }
              }
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

            const isResolved = typeof pre === "string" && pre !== post;

            if (isResolved) {
              if (typeof post === "object") {
                return {
                  logical: pre,
                  ...post
                } as any;
              }

              return {
                logical: pre,
                value: post,
                resolved: true,
                resolvedBy: {
                  using: post.startsWith("xpath=") ? "xpath" : "css",
                  value: post.replace(/^(css|xpath)=/, "")
                },
                attempts: [
                  {
                    using: post.startsWith("xpath=") ? "xpath" : "css",
                    value: post.replace(/^(css|xpath)=/, ""),
                    result: "success"
                  }
                ]
              } as any;
            }

            const nvValue = typeof post === "string" ? post : (post?.value ?? String(post));

            return {
              value: nvValue,
              resolved: true
            } as any;
          })();

          const normalizedData = (() => {
            const d: any = (step as any).data;
            if (d && typeof d === "object" && "value" in d) {
               return d; 
            }

            const v: any = (step as any).value ?? (step as any).input;
            if (v === undefined) return undefined;

            return { value: v, masked: false };
          })();

          stepResults.push({
            ...(step as any),
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

    let reportingDomain: "ui" | "api" | "system" = "system";
    
    if (lastTestDomainValue === TestDomainFlag.UI) {
      reportingDomain = "ui";
    } else if (lastTestDomainValue === TestDomainFlag.API) {
      reportingDomain = "api";
    } else {
      reportingDomain = "system";
    }

    return {
      ...(test as any),
      id: test.id,
      name: test.name,
      testDomain: reportingDomain, 
      projectId,
      executionMode: isHeadless(this.options) ? "headless" : "headed",
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