import type { Page } from "playwright";
import type { JsonStep } from "../types";
import type { StepExecutor } from "./StepExecutor";

export class StubExecutor implements StepExecutor {
  async execute(_step: JsonStep, _page: Page | null): Promise<void> {
    // Intentionally no-op.
  }
}
