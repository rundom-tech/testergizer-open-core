import { chromium, Browser, Page } from "playwright";
import {
  CoreRunnerOptions,
  JsonTestDefinition,
  ExecutionMode,
} from "./types";

import { StepExecutor } from "./executors/StepExecutor";
import { StubExecutor } from "./executors/StubExecutor";
import { PlaywrightExecutor } from "./executors/PlaywrightExecutor";

export class CoreRunner {
  private browser: Browser | null = null;
  private page: Page | null = null;

  private readonly options: CoreRunnerOptions;
  private readonly executionMode: ExecutionMode;
  private readonly executor: StepExecutor;

  constructor(options: CoreRunnerOptions = {}) {
    this.options = options;
    this.executionMode = options.executionMode ?? "playwright";

    this.executor =
      this.executionMode === "stub"
        ? new StubExecutor()
        : new PlaywrightExecutor();
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

  async run(test: JsonTestDefinition): Promise<void> {
    const page =
      this.executionMode === "stub" ? null : await this.ensurePage();

    for (const step of test.steps) {
      await this.executor.execute(step, page);
    }
  }

  async dispose(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}