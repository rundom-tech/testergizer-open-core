import { chromium, Browser, Page } from "playwright";
import {
  CoreRunnerOptions,
  JsonTestDefinition,
  ExecutionMode
} from "./types";
import { TestResult, StepResult } from "./resultTypes";

function nowIso(): string {
  return new Date().toISOString();
}

export class CoreRunner {
  private browser: Browser | null = null;
  private page: Page | null = null;

  private readonly options: CoreRunnerOptions;
  private readonly executionMode: ExecutionMode;

  constructor(options: CoreRunnerOptions = {}) {
    this.options = options;
    this.executionMode = options.executionMode ?? "stub";
  }

  async run(test: JsonTestDefinition): Promise<TestResult> {
    const startedAt = nowIso();
    const stepResults: StepResult[] = [];

    for (const step of test.steps) {
      const stepStart = Date.now();

      const stepResult: StepResult = {
        id: step.id,
        action: step.action,
        domain: step.domain,
        status: "passed",
        attempts: 1,
        errors: [],
        startedAt: new Date(stepStart).toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: Date.now() - stepStart
      };

      stepResults.push(stepResult);
    }

    const endedAt = nowIso();

    const testResult: TestResult = {
      id: test.id,
      name: test.name,
      testDomain: test.testDomain ?? "system",
      executionMode: this.executionMode,
      status: "passed",
      startedAt,
      endedAt,
      steps: stepResults
    };

    return testResult;
  }

  async dispose(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}
